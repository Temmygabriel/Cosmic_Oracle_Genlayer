# v0.1.0
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json
import typing


class CosmicOracle(gl.Contract):

    total: u256
    fortunes: TreeMap[u256, str]

    def __init__(self):
        self.total = u256(0)

    @gl.public.write
    def ask_oracle(self, name: str, sign: str, question: str) -> typing.Any:

        # ── Speed optimisation ──────────────────────────────────────
        # prompt_non_comparative lets each validator judge independently
        # rather than doing exact string matching — reaches consensus
        # faster because minor wording differences are fine.
        # ────────────────────────────────────────────────────────────

        fortune = gl.eq_principle.prompt_non_comparative(
            input=f"Name: {name}\nStar sign: {sign}\nQuestion: {question}",
            task=(
                "You are a mystical cosmic oracle. "
                "Read the person's star sign energy and answer their question "
                "with a short, vivid, personalised fortune of 2-3 sentences. "
                "Be dramatic, poetic, and specific to their sign. "
                "End with one bold prophecy sentence starting with 'The cosmos decrees:'."
            ),
            criteria=(
                "The fortune must: "
                "1) Be 2-3 sentences plus the prophecy line. "
                "2) Reference the person's star sign. "
                "3) Address their question. "
                "4) End with 'The cosmos decrees: ...' "
                "5) Be under 100 words total."
            ),
        )

        entry = {
            "id": int(self.total) + 1,
            "name": name,
            "sign": sign,
            "question": question,
            "fortune": fortune,
        }

        self.total = u256(int(self.total) + 1)
        self.fortunes[self.total] = json.dumps(entry)

        return entry

    @gl.public.view
    def get_fortune(self, id: int) -> str:
        return self.fortunes.get(u256(id), "")

    @gl.public.view
    def get_total(self) -> int:
        return int(self.total)

    @gl.public.view
    def get_recent(self, count: int) -> str:
        results = []
        total = int(self.total)
        start = max(1, total - count + 1)
        for i in range(start, total + 1):
            raw = self.fortunes.get(u256(i), "")
            if raw:
                results.append(json.loads(raw))
        results.reverse()
        return json.dumps(results)
