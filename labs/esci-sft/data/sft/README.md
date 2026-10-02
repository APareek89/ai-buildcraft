# Generated ESCI data

This checkout does not bundle prepared records. Run `bash scripts/download.sh`
then `.venv/bin/python scripts/prepare_esci_sft.py --small` from the lab root.
The builder writes this directory’s JSONL, stats and a fresh recipe README.

Source dataset: [Amazon Science ESCI](https://github.com/amazon-science/esci-data).
Its Apache-2.0 LICENSE and NOTICE are retained in `../../licenses/`. Dataset
content is subject to those upstream notices; no Amazon endorsement is implied.
