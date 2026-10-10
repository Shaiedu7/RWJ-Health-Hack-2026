import os, json
import boto3, numpy as np
from fastapi import HTTPException

MODEL = os.getenv("BEDROCK_MODEL", "us.anthropic.claude-sonnet-4-5-20250929-v1:0")
FAST = os.getenv("BEDROCK_FAST_MODEL", "us.anthropic.claude-haiku-4-5-20251001-v1:0")
br = boto3.client("bedrock-runtime", region_name=os.getenv("AWS_REGION", "us-east-1"))


# ---------- LLM helpers ----------
def tool_call(model, system, content, name, schema):
    r = br.converse(modelId=model, system=[{"text": system}], messages=[{"role": "user", "content": content}],
        toolConfig={"tools": [{"toolSpec": {"name": name, "inputSchema": {"json": schema}}}], "toolChoice": {"tool": {"name": name}}})
    for b in r["output"]["message"]["content"]:
        if "toolUse" in b: return b["toolUse"]["input"]
    raise HTTPException(502, "Model returned no structured output")
def embed(t):
    r = br.invoke_model(modelId="amazon.titan-embed-text-v2:0", body=json.dumps({"inputText": t[:8000]}))
    return json.loads(r["body"].read())["embedding"]
def retrieve(chunks, q, k=3):
    if not chunks: return []
    qv = np.array(embed(q)); s = [float(np.dot(qv, c["v"]) / (np.linalg.norm(qv) * np.linalg.norm(c["v"]))) for c in chunks]
    return [chunks[i]["t"] for i in np.argsort(s)[::-1][:k]]

