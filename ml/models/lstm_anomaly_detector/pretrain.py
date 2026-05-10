import os
import argparse
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset, random_split
import lightning.pytorch as pl
from lightning.pytorch.callbacks import EarlyStopping, ModelCheckpoint
from torchmetrics import Precision, Recall, Accuracy

"""
BEZP Anomaly Detector Pretraining Script (PyTorch Lightning)

Datasets:
- Columbia Gaze & MPIIGaze (Baseline screen gaze)
- DISFA & BP4D (Stress/Anomaly facial action units)
- CMU Keystroke (Typing rhythm distribution)

This script implements a 2-layer LSTM architecture (64 units) as specified
to establish behavioral priors before Federated Learning fine-tuning.
"""

# Feature mapping (20 dimensions): 
# Pose(3), Gaze(2), rPPG(1), AU(10), Keystroke(4)
FEATURE_DIM = 20
SEQ_LENGTH = 150 # 1 minute window at ~2.5 FPS

class BEZPAnomalyDetector(pl.LightningModule):
    def __init__(self, input_dim=20, hidden_dim=64, lr=1e-3):
        super().__init__()
        self.save_hyperparameters()
        
        # 2-layer LSTM architecture
        self.lstm = nn.LSTM(
            input_size=input_dim, 
            hidden_size=hidden_dim, 
            num_layers=2, 
            batch_first=True,
            dropout=0.2
        )
        
        # Binary classification head
        self.fc = nn.Linear(hidden_dim, 1)
        self.sigmoid = nn.Sigmoid()
        
        # Metrics
        self.train_acc = Accuracy(task="binary")
        self.val_acc = Accuracy(task="binary")
        self.val_precision = Precision(task="binary")
        self.val_recall = Recall(task="binary")
        
        self.loss_fn = nn.BCELoss()

    def forward(self, x):
        # x: (batch, seq_len, input_dim)
        _, (hn, _) = self.lstm(x)
        # hn: (num_layers, batch, hidden_dim) -> take last layer
        last_hidden = hn[-1]
        out = self.fc(last_hidden)
        return self.sigmoid(out)

    def training_step(self, batch, batch_idx):
        x, y = batch
        y_hat = self(x)
        loss = self.loss_fn(y_hat, y)
        self.log("train_loss", loss, prog_bar=True)
        self.log("train_acc", self.train_acc(y_hat, y), on_step=False, on_epoch=True)
        return loss

    def validation_step(self, batch, batch_idx):
        x, y = batch
        y_hat = self(x)
        loss = self.loss_fn(y_hat, y)
        
        self.val_acc(y_hat, y)
        self.val_precision(y_hat, y)
        self.val_recall(y_hat, y)
        
        self.log("val_loss", loss, prog_bar=True)
        self.log("val_acc", self.val_acc, on_epoch=True)
        self.log("val_precision", self.val_precision, on_epoch=True)
        self.log("val_recall", self.val_recall, on_epoch=True)
        return loss

    def configure_optimizers(self):
        return torch.optim.Adam(self.parameters(), lr=self.hparams.lr)

class SequenceBuilder:
    """
    Constructs temporal sequences (N, 600, 5) for LSTM training.
    Features: [Gaze, rPPG, AU, Keystroke, Agreement]
    """
    def __init__(self, gaze_pool, au_pool, keystroke_stats):
        self.gaze_pool = gaze_pool # Preprocessed gaze scores
        self.au_pool = au_pool     # Preprocessed AU vectors
        self.keystroke_stats = keystroke_stats

    def build_legitimate(self, count=400):
        sequences = []
        for _ in range(count):
            # 600 timesteps of stable behavior
            seq = np.zeros((SEQ_LENGTH, 5))
            # Sample from normal distributions derived from public data
            seq[:, 0] = np.random.choice(self.gaze_pool, SEQ_LENGTH) # Gaze
            # ... apply temporal smoothing ...
            sequences.append(seq)
        return np.array(sequences), np.zeros(count)

    def build_cheating(self, count=400):
        sequences = []
        labels = np.ones(count)
        # Construct phone-glance, coached-answer, etc. patterns
        # by injecting specific elevations into the pools
        return np.array(sequences), labels

class PublicDataModule(pl.LightningDataModule):
    def __init__(self, batch_size=64):
        super().__init__()
        self.batch_size = batch_size

    def setup(self, stage=None):
        # Placeholder for dataset parsing logic
        # Columbia Gaze + MPIIGaze + DISFA + BP4D + CMU Keystroke
        num_samples = 5000
        X = torch.randn(num_samples, SEQ_LENGTH, FEATURE_DIM)
        # 80% normal (0), 20% anomaly (1) for pretraining priors
        y = (torch.rand(num_samples, 1) > 0.8).float()
        
        full_ds = TensorDataset(X, y)
        train_size = int(0.8 * num_samples)
        val_size = num_samples - train_size
        self.train_ds, self.val_ds = random_split(full_ds, [train_size, val_size])

    def train_dataloader(self):
        return DataLoader(self.train_ds, batch_size=self.batch_size, shuffle=True, num_workers=2)

    def val_dataloader(self):
        return DataLoader(self.val_ds, batch_size=self.batch_size, num_workers=2)

def main():
    parser = argparse.ArgumentParser(description="Pretrain BEZP Anomaly Detector")
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--data-dir", type=str, default="./data", help="Directory containing the pretraining datasets")
    parser.add_argument("--output-dir", type=str, default="./exports")
    parser.add_argument("--accelerator", type=str, default="auto", choices=["auto", "cpu", "gpu"], help="Hardware accelerator to use (auto, cpu, gpu)")
    args = parser.parse_args()

    # Initialize model and data
    model = BEZPAnomalyDetector(input_dim=FEATURE_DIM, lr=args.lr)
    dm = PublicDataModule(batch_size=args.batch_size)

    # Callbacks
    checkpoint_cb = ModelCheckpoint(
        dirpath=args.output_dir,
        filename="bezp-best-{val_loss:.2f}",
        monitor="val_loss",
        mode="min"
    )
    early_stop_cb = EarlyStopping(monitor="val_loss", patience=3)

    # Trainer
    trainer = pl.Trainer(
        max_epochs=args.epochs,
        accelerator=args.accelerator,
        devices=1,
        callbacks=[checkpoint_cb, early_stop_cb],
        log_every_n_steps=10
    )

    print("Starting pretraining on public behavioral datasets...")
    trainer.fit(model, dm)

    # Export Logic
    os.makedirs(args.output_dir, exist_ok=True)
    
    # 1. Export to ONNX (Intermediate format for TF conversion)
    input_sample = torch.randn(1, SEQ_LENGTH, FEATURE_DIM)
    onnx_path = os.path.join(args.output_dir, "bezp_model.onnx")
    model.to_onnx(onnx_path, input_sample, export_params=True)
    print(f"Model exported to ONNX: {onnx_path}")

    # 2. PyTorch Checkpoint
    torch.save(model.state_dict(), os.path.join(args.output_dir, "bezp_weights.pt"))
    print(f"PyTorch weights saved to: {os.path.join(args.output_dir, 'bezp_weights.pt')}")

    print("\n--- Next Steps for TFJS Conversion ---")
    print("1. Install onnx-tf: pip install onnx-tensorflow")
    print("2. Convert ONNX to SavedModel:")
    print(f"   onnx-tf convert -i {onnx_path} -o {os.path.join(args.output_dir, 'saved_model')}")
    print("3. Convert SavedModel to TFJS:")
    print(f"   tensorflowjs_converter --input_format=tf_saved_model {os.path.join(args.output_dir, 'saved_model')} {os.path.join(args.output_dir, 'tfjs_model')}")

if __name__ == "__main__":
    main()
