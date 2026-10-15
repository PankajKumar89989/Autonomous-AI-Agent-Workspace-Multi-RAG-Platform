import asyncio

from app.agents.base import Agent, AgentContext, AgentResult, Limits
from app.agents.errors import AgentError, AgentSkipped, TransientError
from app.agents.orchestrator import Orchestrator, OrchestratorConfig
from app.agents.state import PlanStep, RunOptions, RunState
from app.rag.llm import LLMError


class Scripted(Agent):
    """An agent whose attempts follow a script: exceptions are raised, callables are run, delays are awaited."""

    def __init__(self, name, *script, fallback=None, timeout=None):
        self.name, self.script, self._fallback, self.calls = name, list(script), fallback, 0
        self.timeout_s = timeout

    async def run(self, ctx, step, state):
        action = self.script[min(self.calls, len(self.script) - 1)]
        self.calls += 1
        if isinstance(action, BaseException):
            raise action
        if isinstance(action, (int, float)):
            await asyncio.sleep(action)
            return AgentResult("slow")
        return AgentResult(action(state) if callable(action) else str(action))

    async def fallback(self, ctx, step, state):
        return AgentResult(self._fallback(state)) if self._fallback else None


def _plan(*agents):
    def planner(state):
        state.plan = [PlanStep(f"s{i}", a, f"{a} task", ["q q q"]) for i, a in enumerate(agents, 1)]
        return "planned"

    return planner


def _add(title, url=None):
    def action(state):
        if url:
            state.evidence.add_web(title, url, "web content here")
        else:
            state.evidence.add_web(title, f"https://docs.example/{title}", "doc content")
        return f"added {title}"

    return action


def _findings(state):
    state.findings = [{"claim": "c", "sources": [1], "confidence": "low"}]
    return "analysed"


def _report(state):
    state.report = "## Summary\nA claim [1]."
    return "written"


def _cite(state):
    state.final_report = state.report + "\n\n## Sources"
    state.evidence.items[0].cited = True
    return "cited"


def _agents(**overrides):
    base = {
        "planner": Scripted("planner", _plan("document", "web")),
        "document": Scripted("document", _add("d1")),
        "web": Scripted("web", _add("w1")),
        "analyst": Scripted("analyst", _findings),
        "summarizer": Scripted("summarizer", _report),
        "citation": Scripted("citation", _cite),
    }
    base.update(overrides)
    return base


def _run(agents, **cfg):
    state = RunState("objective", RunOptions())
    config = OrchestratorConfig(**{"step_timeout_s": 2, "run_timeout_s": 10, "max_attempts": 2, "retry_backoff_s": 0, **cfg})
    ctx = AgentContext(None, None, None, None, None, None, Limits())
    orch = Orchestrator(ctx, agents, config, state)

    async def collect():
        return [event async for event in orch.execute()]

    events = asyncio.run(collect())
    return state, events, {r.id: r for r in state.steps}


def test_happy_path_runs_every_agent_in_order():
    state, events, steps = _run(_agents())
    assert state.status == "completed" and state.final_report.endswith("## Sources")
    assert [s.agent for s in state.steps] == ["planner", "document", "web", "analyst", "summarizer", "citation"]
    assert all(r.status == "completed" for r in state.steps)
    names = [n for n, _ in events]
    assert names.index("plan") < names.index("sources") < names.index("report") and names[-1] == "report"
    plan_event = next(p for n, p in events if n == "plan")
    assert [s["status"] for s in plan_event["steps"]] == ["completed"] + ["pending"] * 5
    assert events[-1][1]["cited"] == [1]


def test_retrieval_steps_run_in_parallel():
    slow = {"document": Scripted("document", 0.3), "web": Scripted("web", 0.3)}
    slow["document"].script = [0.3]
    state, events, _ = _run(_agents(**slow))
    started = [i for i, (n, p) in enumerate(events) if n == "step" and p["status"] == "running" and p["agent"] in ("document", "web")]
    finished = [i for i, (n, p) in enumerate(events) if n == "step" and p["status"] in ("completed", "failed") and p["agent"] in ("document", "web")]
    assert max(started) < min(finished)  # both began before either finished


def test_transient_failure_is_retried():
    agents = _agents(document=Scripted("document", LLMError("rate limit"), _add("d1")))
    state, _, steps = _run(agents)
    assert steps["s1"].status == "completed" and steps["s1"].attempts == 2 and agents["document"].calls == 2


def test_non_retryable_error_fails_immediately():
    agents = _agents(web=Scripted("web", AgentError("API key rejected"), _add("w1")))
    state, _, steps = _run(agents)
    assert steps["s2"].status == "failed" and steps["s2"].attempts == 1 and steps["s2"].error == "API key rejected"
    assert state.status == "completed" and any("results may be incomplete" in w for w in state.warnings)


def test_timeout_fails_step_after_retries_but_run_continues():
    agents = _agents(web=Scripted("web", 5, timeout=0.05))
    state, _, steps = _run(agents)
    assert steps["s2"].status == "failed" and "Timed out" in steps["s2"].error and steps["s2"].attempts == 2
    assert state.status == "completed" and len(state.evidence) == 1


def test_skipped_step_is_not_a_failure():
    agents = _agents(web=Scripted("web", AgentSkipped("Web search is not configured.")))
    state, _, steps = _run(agents)
    assert steps["s2"].status == "skipped" and state.status == "completed"
    assert any("was skipped" in w for w in state.warnings)


def test_all_retrieval_failing_fails_the_run():
    agents = _agents(document=Scripted("document", TransientError("db down")), web=Scripted("web", TransientError("net down")))
    state, events, steps = _run(agents)
    assert state.status == "failed" and "Every research step failed" in state.error
    assert steps["analyst"].status == "skipped" and not any(n == "report" for n, _ in events)


def test_no_evidence_gives_an_honest_report_without_calling_the_model_agents():
    agents = _agents(document=Scripted("document", "nothing found"), web=Scripted("web", "nothing found"))
    state, events, steps = _run(agents)
    assert state.status == "completed" and "won't guess" in state.final_report
    assert agents["analyst"].calls == agents["summarizer"].calls == 0
    assert steps["analyst"].status == steps["summarizer"].status == "skipped"


def test_analyst_failure_uses_fallback_and_warns():
    agents = _agents(analyst=Scripted("analyst", TransientError("bad json"), fallback=_findings))
    state, _, steps = _run(agents)
    assert steps["analyst"].status == "completed" and steps["analyst"].fallback
    assert state.status == "completed" and any("analyst agent failed" in w for w in state.warnings)


def test_summarizer_without_fallback_fails_the_run():
    agents = _agents(summarizer=Scripted("summarizer", TransientError("boom")))
    state, _, steps = _run(agents)
    assert state.status == "failed" and steps["citation"].status == "skipped"


def test_citation_failure_keeps_the_report_with_a_warning():
    agents = _agents(citation=Scripted("citation", RuntimeError("bug")))
    state, events, steps = _run(agents)
    assert steps["citation"].status == "failed" and state.status == "completed"
    assert state.final_report == state.report and any("Citations were not checked" in w for w in state.warnings)


def test_planner_failure_fails_the_run():
    state, _, steps = _run(_agents(planner=Scripted("planner", TransientError("model down"))))
    assert state.status == "failed" and steps["planner"].status == "failed" and state.error == "model down"


def test_run_deadline_skips_remaining_steps():
    agents = _agents(document=Scripted("document", 0.3), web=Scripted("web", _add("w1")))
    state, _, steps = _run(agents, run_timeout_s=0.1)
    assert steps["analyst"].status == "skipped" and "time limit" in steps["analyst"].summary
    assert state.status == "failed" and "time limit" in state.error
