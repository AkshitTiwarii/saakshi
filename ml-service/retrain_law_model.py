"""
Starter script for retraining/fine-tuning the Indian law model in this codebase.

This is intentionally lightweight and safe to edit for your own dataset.
"""

import os

from datasets import Dataset
from transformers import AutoModelForCausalLM, AutoTokenizer, Trainer, TrainingArguments

BASE_MODEL = os.getenv("BASE_MODEL", "tiiuae/falcon-7b")
OUTPUT_DIR = os.getenv("OUTPUT_DIR", "./ml-service/checkpoints/falcon-indian-law")


def build_dummy_dataset() -> Dataset:
    rows = [
        {"text": "Prompt: Threatened repeatedly near market.\nAnswer: Possible IPC 506 and IPC 354D depending on facts."},
        {"text": "Prompt: Assault with bodily injury.\nAnswer: Consider IPC 323 and medical corroboration."},
    ]
    return Dataset.from_list(rows)


def tokenize(dataset: Dataset, tokenizer):
    def _tok(batch):
        out = tokenizer(batch["text"], truncation=True, padding="max_length", max_length=512)
        out["labels"] = out["input_ids"].copy()
        return out

    return dataset.map(_tok, batched=True, remove_columns=["text"])


def main():
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(BASE_MODEL, trust_remote_code=True)

    ds = build_dummy_dataset()
    tokenized = tokenize(ds, tokenizer)

    args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=4,
        num_train_epochs=1,
        logging_steps=10,
        save_steps=100,
        learning_rate=2e-5,
        fp16=False,
        bf16=False,
        report_to=[],
    )

    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=tokenized,
    )

    trainer.train()
    trainer.save_model(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)
    print(f"Saved checkpoint to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
