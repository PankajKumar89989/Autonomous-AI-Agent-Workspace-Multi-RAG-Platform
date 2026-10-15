import asyncio

from app.agents.errors import ToolError, ToolInputError
from app.agents.profile import AgentProfile, system_addendum
from app.agents.tools.base import ToolContext, ToolResult, ToolSource, ToolSpec
from app.agents.tools.calculator import extract_expression, format_number, run_calculator, safe_eval
from app.agents.tools.csv_analysis import summarize_csv
from app.agents.tools.planning import ToolCall, execute_tool_calls, heuristic_calls, plan_tool_calls, validate_calls
from app.agents.tools.registry import TOOL_SPECS
from app.rag.llm import ChatMessage, MockChatModel


def _raises(exc, fn, *args):
    try:
        fn(*args)
    except exc:
        return True
    return False


def test_calculator_does_exact_arithmetic():
    assert safe_eval("2 + 3 * 4") == 14 and safe_eval("(2+3)*4") == 20 and safe_eval("2^10") == 1024
    assert safe_eval("15% of 2400") == 360 and safe_eval("1,200 + 300") == 1500 and safe_eval("7 ÷ 2") == 3.5
    assert format_number(safe_eval("10/4")) == "2.5" and format_number(safe_eval("6/3")) == "2" and format_number(safe_eval("2**10")) == "1024"
    assert safe_eval("-5 + +2") == -3 and safe_eval("10 % 4") == 2


def test_calculator_refuses_anything_that_is_not_arithmetic():
    for bad in ("__import__('os').system('ls')", "open('x')", "1; 2", "abs(-1)", "a + 1", "2 ** 9999", "9**9**9", "1/0", "", "-" * 60 + "1", "(" * 120 + "1" + ")" * 120):
        assert _raises(ToolInputError, safe_eval, bad), bad


def test_extract_expression_finds_arithmetic_in_a_sentence():
    assert extract_expression("What is 15% of 2400 please?") == "15% of 2400"
    assert extract_expression("Compute (12 + 8) * 3 for me") == "(12 + 8) * 3"
    assert extract_expression("Tell me about batteries in 2024") is None


def test_calculator_tool_returns_a_citable_source():
    result = asyncio.run(run_calculator(ToolContext(None, None, None, None), {"expression": "15% of 2400"}))
    assert result.sources[0].content == "15% of 2400 = 360"
    assert result.sources[0].kind == "tool"
    assert _raises(ToolInputError, lambda: asyncio.run(run_calculator(ToolContext(None, None, None, None), {})))


def test_csv_summary_reports_numbers_and_text_columns():
    text = "region,revenue,units\nNorth,\"1,200\",10\nSouth,800,20\nNorth,400,30\n"
    out = summarize_csv(text)
    assert "3 rows and 3 columns" in out and "revenue: count 3, min 400, max 1200, mean 800, sum 2400" in out
    assert "region: 2 distinct values in 3 filled cells" in out
    only = summarize_csv(text, "UNITS")
    assert "units: count 3" in only and "revenue" not in only.split("\n", 1)[1]
    assert _raises(ToolInputError, summarize_csv, text, "nope") and _raises(ToolInputError, summarize_csv, "")


def test_validate_calls_filters_and_caps():
    raw = [
        {"tool": "calculator", "input": {"expression": "1+1"}},
        {"tool": "calculator", "input": {"expression": "1+1"}},
        {"tool": "search_web", "input": {"query": "x"}},
        {"tool": "not_enabled", "input": {}},
        {"tool": "calculator", "input": "bad"},
        "junk",
    ]
    assert validate_calls(raw, {"calculator", "search_web"}, 5) == [ToolCall("calculator", {"expression": "1+1"}), ToolCall("search_web", {"query": "x"})]
    assert len(validate_calls(raw, {"calculator", "search_web"}, 1)) == 1 and validate_calls("nope", {"calculator"}, 3) == []


def test_heuristics_prefer_the_calculator_then_the_web():
    assert heuristic_calls("what is 12 * 7?", {"calculator", "search_web"}) == [ToolCall("calculator", {"expression": "12 * 7"})]
    assert heuristic_calls("latest battery news", {"calculator", "search_web"})[0].tool == "search_web"
    assert heuristic_calls("latest battery news", {"calculator"}) == []


class Scripted:
    model_id, is_mock = "scripted", False

    def __init__(self, reply):
        self.reply = reply

    async def complete(self, messages, *, temperature=0.0, max_tokens=300):
        return self.reply


def test_planning_uses_the_model_and_survives_garbage():
    specs = [TOOL_SPECS["calculator"], TOOL_SPECS["search_web"]]
    good = Scripted('{"calls":[{"tool":"calculator","input":{"expression":"2+2"}}]}')
    assert asyncio.run(plan_tool_calls(good, "q", [], specs, 3)) == [ToolCall("calculator", {"expression": "2+2"})]
    garbage = Scripted("no idea")
    assert asyncio.run(plan_tool_calls(garbage, "what is 3 * 3?", [ChatMessage("user", "hi")], specs, 3))[0].tool == "calculator"
    assert asyncio.run(plan_tool_calls(good, "q", [], specs, 0)) == []
    assert asyncio.run(plan_tool_calls(MockChatModel(), "what is 3 * 3?", [], specs, 3))[0].tool == "calculator"


def test_execution_turns_tool_failures_into_warnings():
    async def ok(ctx, params):
        return ToolResult("fine", [ToolSource("tool", "Good", "result")])

    async def empty(ctx, params):
        return ToolResult("nothing found")

    async def transient(ctx, params):
        raise ToolError("search is down")

    async def bad_input(ctx, params):
        raise ToolInputError("needs a query")

    async def crash(ctx, params):
        raise RuntimeError("bug")

    async def slow(ctx, params):
        await asyncio.sleep(5)

    specs = {n: ToolSpec(n, n.title(), "d", {}, runner=r) for n, r in dict(ok=ok, empty=empty, transient=transient, bad_input=bad_input, crash=crash, slow=slow).items()}
    calls = [ToolCall(n, {}) for n in specs]
    sources, warnings = asyncio.run(execute_tool_calls(ToolContext(None, None, None, None), specs, calls, timeout=0.2))
    assert [s.title for s in sources] == ["Good"]
    text = " | ".join(warnings)
    assert "Empty: nothing found" in text and "search is down" in text and "needs a query" in text
    assert "unexpected error" in text and "timed out" in text and len(warnings) == 5


def test_registry_describes_every_tool():
    assert set(TOOL_SPECS) == {"search_documents", "search_web", "calculator", "analyze_csv", "summarize_text"}
    assert TOOL_SPECS["search_documents"].runner is None and TOOL_SPECS["calculator"].runner is not None
    assert TOOL_SPECS["search_web"].requires_web_search and TOOL_SPECS["analyze_csv"].requires_knowledge_base


def test_profile_addendum_keeps_instructions_secondary_to_the_rules():
    profile = AgentProfile("1", "Analyst", "Always answer in bullet points.", None, 0.2, "concise", 3, frozenset({"search_documents"}), True)
    text = system_addendum(profile)
    assert "Always answer in bullet points." in text and "unless they conflict with the rules above" in text and "brief" in text
    assert profile.default_length == "short"
