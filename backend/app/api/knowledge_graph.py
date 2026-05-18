"""GET /api/knowledge-graph — build and return a knowledge graph from stored papers.

Graph schema
------------
Node types  : paper | method | dataset | task
Edge types  : uses | evaluates_on | addresses | improves

The graph is built from rows in the ``paper_extractions`` table that are
populated by the upload pipeline.  All IDs are stable slugs so the frontend
can re-render without node positions jumping.
"""

from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.services.vector_store import get_all_extractions

router = APIRouter(tags=["knowledge-graph"])


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class GraphNode(BaseModel):
    id: str
    label: str
    type: str   # paper | method | dataset | task
    meta: dict[str, Any] = {}


class GraphEdge(BaseModel):
    source: str
    target: str
    relation: str   # uses | evaluates_on | addresses | improves


class KnowledgeGraphResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slug(prefix: str, name: str) -> str:
    """Create a stable, URL-safe node ID."""
    clean = _SLUG_RE.sub("-", name.lower().strip()).strip("-")
    return f"{prefix}:{clean[:80]}"


def _paper_label(extraction: dict[str, Any]) -> str:
    title = (extraction.get("title") or "").strip()
    return title if title else extraction["source"]


# ---------------------------------------------------------------------------
# Graph builder
# ---------------------------------------------------------------------------

def _build_graph(extractions: list[dict[str, Any]]) -> KnowledgeGraphResponse:
    nodes: dict[str, GraphNode] = {}
    edges: list[GraphEdge] = []
    seen_edges: set[tuple[str, str, str]] = set()

    def add_node(node_id: str, label: str, node_type: str, meta: dict | None = None) -> None:
        if node_id not in nodes:
            nodes[node_id] = GraphNode(id=node_id, label=label, type=node_type, meta=meta or {})

    def add_edge(src: str, tgt: str, relation: str) -> None:
        key = (src, tgt, relation)
        if key not in seen_edges:
            seen_edges.add(key)
            edges.append(GraphEdge(source=src, target=tgt, relation=relation))

    # Build a title → paper_id lookup for resolving "improves_on" references.
    title_to_paper_id: dict[str, str] = {}

    # First pass — create all paper nodes.
    for ex in extractions:
        paper_id = _slug("paper", ex["source"])
        label = _paper_label(ex)
        add_node(paper_id, label, "paper", meta={
            "source": ex["source"],
            "authors": ex.get("authors") or [],
            "abstract": (ex.get("abstract") or "")[:300],
            "methodology": (ex.get("methodology") or "")[:300],
        })
        if ex.get("title"):
            title_to_paper_id[ex["title"].strip().lower()] = paper_id

    # Second pass — create method/dataset/task nodes and edges.
    for ex in extractions:
        paper_id = _slug("paper", ex["source"])

        for method_name in (ex.get("methods") or []):
            method_name = method_name.strip()
            if not method_name:
                continue
            mid = _slug("method", method_name)
            add_node(mid, method_name, "method")
            add_edge(paper_id, mid, "uses")

        for ds_name in (ex.get("datasets") or []):
            ds_name = ds_name.strip()
            if not ds_name:
                continue
            did = _slug("dataset", ds_name)
            add_node(did, ds_name, "dataset")
            add_edge(paper_id, did, "evaluates_on")

        for task_name in (ex.get("tasks") or []):
            task_name = task_name.strip()
            if not task_name:
                continue
            tid = _slug("task", task_name)
            add_node(tid, task_name, "task")
            add_edge(paper_id, tid, "addresses")

        for prior_title in (ex.get("improves_on") or []):
            prior_title = prior_title.strip()
            if not prior_title:
                continue
            prior_id = title_to_paper_id.get(prior_title.lower())
            if prior_id and prior_id != paper_id:
                add_edge(paper_id, prior_id, "improves")

    return KnowledgeGraphResponse(nodes=list(nodes.values()), edges=edges)


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.get("/api/knowledge-graph", response_model=KnowledgeGraphResponse)
async def get_knowledge_graph() -> KnowledgeGraphResponse:
    """Return the full knowledge graph built from all uploaded papers.

    Nodes represent **papers**, **methods**, **datasets**, and **tasks**.
    Edges encode **uses**, **evaluates_on**, **addresses**, and **improves**
    relationships extracted by the LLM during upload.
    """
    try:
        extractions = get_all_extractions()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not read paper extractions: {exc}",
        ) from exc

    return _build_graph(extractions)
