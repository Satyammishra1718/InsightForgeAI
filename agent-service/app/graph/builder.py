import logging
from langgraph.graph import StateGraph, START, END
from ..models.state import GraphState
from ..agents.planner import planner_node
from ..agents.researcher import parallel_researcher_node
from ..agents.critic import critic_node
from ..agents.synthesizer import synthesizer_node

logger = logging.getLogger("agent-service.graph")

def build_research_graph():
    """
    Constructs the LangGraph multi-agent orchestration pipeline:
    START -> Planner -> Parallel Researchers -> Critic -> Synthesizer -> END
    """
    logger.info("Assembling LangGraph StateGraph workflow...")
    workflow = StateGraph(GraphState)

    # 1. Add Agent Nodes
    workflow.add_node("planner", planner_node)
    workflow.add_node("researchers", parallel_researcher_node)
    workflow.add_node("critic", critic_node)
    workflow.add_node("synthesizer", synthesizer_node)

    # 2. Add Workflow Edges
    workflow.add_edge(START, "planner")
    workflow.add_edge("planner", "researchers")
    workflow.add_edge("researchers", "critic")
    workflow.add_edge("critic", "synthesizer")
    workflow.add_edge("synthesizer", END)

    app = workflow.compile()
    logger.info("LangGraph pipeline successfully compiled.")
    return app

# Singleton compiled graph instance
research_graph = build_research_graph()
