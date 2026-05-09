import os
import shutil
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import select, update
from sqlalchemy.orm import Session
import redis

from bezp_server.db.models import GlobalModelVersion
from bezp_server.config import get_settings

class ModelRollbackService:
    def __init__(self, db: Session, redis_client: redis.Redis) -> None:
        self.db = db
        self.redis_client = redis_client
        self.settings = get_settings()
        self.model_dir = os.path.join(self.settings.storage_base_path, "ml", "models")
        
        # Ensure model directory exists
        os.makedirs(self.model_dir, exist_ok=True)

    def get_version_history(self, limit: int = 20) -> List[GlobalModelVersion]:
        return list(
            self.db.scalars(
                select(GlobalModelVersion)
                .order_by(GlobalModelVersion.version.desc())
                .limit(limit)
            )
        )

    def rollback_to_version(self, target_version: int) -> GlobalModelVersion:
        # 1. Fetch metadata from PostgreSQL
        version_meta = self.db.get(GlobalModelVersion, target_version)
        if not version_meta:
            raise ValueError(f"Model version {target_version} not found in database.")

        # 2. Update filesystem symlink
        current_link = os.path.join(self.model_dir, "current")
        target_path = version_meta.weights_path
        
        if not os.path.exists(target_path):
            raise FileNotFoundError(f"Model weights not found at {target_path}")

        if os.path.islink(current_link) or os.path.exists(current_link):
            os.remove(current_link)
        
        # In a real environment, we'd use os.symlink. 
        # For cross-platform/demo, we'll copy or just document the intent.
        # os.symlink(target_path, current_link)
        shutil.copytree(target_path, current_link, dirs_exist_ok=True)

        # 3. Update status in PostgreSQL
        # Mark all as superseded
        self.db.execute(
            update(GlobalModelVersion)
            .values(status="superseded")
            .where(GlobalModelVersion.status == "active")
        )
        
        # Mark target as active
        version_meta.status = "active"
        self.db.commit()

        # 4. Update Redis pointer
        self.redis_client.set("global_model:current_version", target_version)
        
        return version_meta

    def add_new_version(self, version: int, precision: float, recall: float, num_gradients: int, weights_path: str, chain_hash: str) -> GlobalModelVersion:
        new_v = GlobalModelVersion(
            version=version,
            created_at=datetime.now(timezone.utc),
            precision=precision,
            recall=recall,
            num_gradients=num_gradients,
            weights_path=weights_path,
            status="active",
            chain_hash=chain_hash
        )
        
        # Mark others as superseded
        self.db.execute(
            update(GlobalModelVersion)
            .values(status="superseded")
            .where(GlobalModelVersion.status == "active")
        )
        
        self.db.add(new_v)
        self.db.commit()
        
        # Update Redis
        self.redis_client.set("global_model:current_version", version)
        
        return new_v
