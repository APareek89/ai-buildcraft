# Slide types, slots and object shapes

Slot names below are the canonical set. When a slide type came from the reference
deck's own layout (`origin: "layout"` in the profile), its slot names are the same
but its geometry and capacities are the template's — always read `max_chars` from
`profile.json` rather than assuming.

Omitted slots are not drawn. That is how you render three cards in `cards_4` or
three figures in `big_numbers`.

## Text types

| Type | Slots |
| --- | --- |
| `title` | `kicker`, `headline`, `subhead` |
| `section` | `eyebrow`, `headline`, `body` |
| `closing` | `headline`, `body`, `cta` |
| `big_numbers` | `headline`, then `number_1..4` and `label_1..4` |
| `cards_2` | `headline`, `card_1_title`, `card_1_body`, `card_2_title`, `card_2_body` |
| `cards_3` | as above through `card_3_*` |
| `cards_4` | as above through `card_4_*` |
| `ranked_list` | `headline`, then `item_1_title`/`item_1_body` … up to `item_6_*` |

Writing rules that hold across all of them:

- `headline` asserts a claim. Not "Q3 results" — "Churn doubled after the pricing change".
- `number_*` is the figure alone (`38%`, `$4.1M`, `11 days`); `label_*` says what it measures.
- Card titles are two to four words. Card bodies are one sentence, occasionally two.
- `ranked_list` order is the argument. If the order is arbitrary, use a `cards_*` type instead.
- `source` and `cta` are single short lines.

## `chart_insight`

Slots: `headline`, `subhead`, `chart`, `insight_1_title`, `insight_1_body`, `source`.

```json
"chart": {
  "type": "column",
  "categories": ["Q1", "Q2", "Q3", "Q4"],
  "series": [{"name": "Churn %", "values": [18, 24, 31, 38]}],
  "unit": "%",
  "title": "Churn doubled in four quarters",
  "source": "Internal billing data"
}
```

- `type` is one of `column`, `bar`, `line`, `stacked_bar`, `scatter`, `waterfall`.
- Every series' `values` must be the same length as `categories` (except `scatter`).
- `null` is allowed inside `values` for a genuine gap.
- `title` must be at least three words and must state the finding; a label is rejected.
- The chart is a **native, editable** PowerPoint chart, not an image. Series take theme accent colours.
- `waterfall` is built from a single series of signed deltas; the running base is computed for you.
- `insight_1_*` is the interpretation next to the chart — say what the reader should conclude.

## `table`

Slots: `headline`, `table`, `source`.

```json
"table": {
  "headers": ["Segment", "ARR", "Churn"],
  "rows": [["Enterprise", "$12.4M", "6%"], ["Mid-market", "$8.1M", "38%"]]
}
```

Every row must match the header count. Capacity is 8 rows by 7 columns; past that,
split the table across slides or promote the point into `big_numbers`. Cells are
strings — format the numbers yourself. The header band and banding use theme colours.

## `flow`

Slots: `headline`, `flow`, `source`.

```json
"flow": {
  "layout": "stage_flow",
  "nodes": [{"id": "a", "label": "Trial"}, {"id": "b", "label": "Activate"}],
  "edges": [{"from": "a", "to": "b"}]
}
```

- `layout` is `stage_flow` (default), `pyramid`, or `two_by_two`.
- Two to eight nodes. Labels are one to three words.
- `two_by_two` expects exactly four nodes, placed top-left, top-right, bottom-left, bottom-right in order.
- `pyramid` draws one band per node, widest at the bottom; `edges` are ignored.
- `stage_flow` uses Graphviz for placement when `dot` is installed and a deterministic
  left-to-right chain when it is not. Both are correct output.

## Full example

```json
{"slides": [
  {"n": 1, "slide_type": "title",
   "slots": {"kicker": "Board review",
             "headline": "Growth is stalling in mid-market",
             "subhead": "Where the next two quarters get won"}},
  {"n": 2, "slide_type": "big_numbers",
   "slots": {"headline": "The quarter in three numbers",
             "number_1": "38%", "label_1": "Mid-market churn, up from 24%",
             "number_2": "$4.1M", "label_2": "Pipeline created in Q3",
             "number_3": "11 days", "label_3": "Median time to first value"}},
  {"n": 3, "slide_type": "closing",
   "slots": {"headline": "Fix activation first",
             "body": "One quarter, one owner, one metric: time to first value under five days.",
             "cta": "Decision needed today"}}
]}
```
