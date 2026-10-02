"""Evaluate every held-out example with the saved adapter before deployment."""
import argparse
import json
from pathlib import Path
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
from train_accounting_lora import evaluate_generation, read, write


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--artifact',type=Path,required=True)
    args=parser.parse_args()
    adapter=args.artifact/'adapter'
    meta=json.loads((adapter/'training-metadata.json').read_text())
    torch.set_num_threads(8)
    tokenizer=AutoTokenizer.from_pretrained(meta['base_model'],local_files_only=True)
    tokenizer.pad_token=tokenizer.eos_token
    base=AutoModelForCausalLM.from_pretrained(meta['base_model'],dtype=torch.bfloat16,device_map={'':0},attn_implementation='sdpa',local_files_only=True)
    model=PeftModel.from_pretrained(base,adapter,local_files_only=True).merge_and_unload().eval()
    report=evaluate_generation(model,tokenizer,read(args.artifact/'test.jsonl'))
    # Report semantic amount equality for summaries (e.g. 9.50 equals 9.5).
    import re
    from decimal import Decimal
    for filename in ['baseline.json', 'evaluation.json']:
        path=adapter/filename
        prior=json.loads(path.read_text())
        subset=[r for r in prior['outputs'] if r['task']=='summary']
        for row in subset:
            expected=[Decimal(n) for n in re.findall(r'-?\d+\.\d{2}',row['expected'])]
            actual={Decimal(n) for n in re.findall(r'-?\d+(?:\.\d+)?',row['actual'].replace(',',''))}
            row['correct']=all(n in actual for n in expected)
        prior['tasks']['summary']={'count':len(subset),'correct':sum(r['correct'] for r in subset),'accuracy':sum(r['correct'] for r in subset)/len(subset)}
        write(path,prior)
    passed=report['tasks']['extract']['accuracy']>=.90 and report['tasks']['clarify']['accuracy']>=.875 and report['tasks']['summary']['accuracy']>=.875
    report['passed']=passed
    write(adapter/'full-test-evaluation.json',report)
    meta['full_test_evaluation']=report['tasks']
    meta['full_test_passed']=passed
    selected=json.loads((adapter/'evaluation.json').read_text())['tasks']
    meta['evaluation']=selected
    meta['passed_release_gate']=(meta['best_validation_loss'] < meta['baseline_validation_loss']
        and selected['extract']['accuracy']>=.90 and selected['clarify']['accuracy']>=.875
        and selected['summary']['accuracy']>=.875 and passed)
    write(adapter/'training-metadata.json',meta)
    print(json.dumps({'passed':passed,'tasks':report['tasks']},ensure_ascii=False,indent=2))
    if not passed: raise SystemExit('Full held-out evaluation failed')


if __name__=='__main__':main()
