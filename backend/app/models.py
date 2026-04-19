from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def gen_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


# ---------- Users ----------
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")

    user_id: str
    email: str
    name: str
    role: str = "user"  # 'admin' | 'manager' | 'user' | custom role name
    balance: float = 0.0
    avatar_url: Optional[str] = None
    auth_provider: str = "local"  # 'local' | 'emergent_google'
    status: str = "active"  # 'active' | 'suspended'
    created_at: datetime = Field(default_factory=now_utc)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    user_id: str
    email: str
    name: str
    role: str
    balance: float
    avatar_url: Optional[str] = None
    auth_provider: str
    status: str
    created_at: datetime


# ---------- Roles ----------
class Role(BaseModel):
    role_id: str
    name: str
    permissions: List[str] = []
    is_system: bool = False
    created_at: datetime = Field(default_factory=now_utc)


class RoleCreate(BaseModel):
    name: str
    permissions: List[str] = []


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    permissions: Optional[List[str]] = None


# ---------- Suppliers ----------
class Supplier(BaseModel):
    supplier_id: str
    name: str
    api_url: str
    api_key: str
    status: str = "active"
    is_mock: bool = False
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=now_utc)


class SupplierCreate(BaseModel):
    name: str
    api_url: str
    api_key: str
    notes: Optional[str] = None


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    api_url: Optional[str] = None
    api_key: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


# ---------- Services ----------
class Service(BaseModel):
    service_id: str
    supplier_id: Optional[str] = None
    supplier_service_id: Optional[str] = None
    platform: str  # 'instagram' | 'facebook' | 'twitter' | 'tiktok' | 'youtube'
    category: str  # 'Followers' | 'Likes' | 'Views' | 'Comments' | 'Shares'
    name: str
    description: Optional[str] = None
    type: str = "Default"  # 'Default' | 'Custom Comments' | 'Drip Feed' | ...
    rate: float  # Client-facing price per 1000
    supplier_rate: float = 0.0  # Supplier cost per 1000 (for profit)
    min: int = 10
    max: int = 100000
    active: bool = True
    created_at: datetime = Field(default_factory=now_utc)


class ServiceCreate(BaseModel):
    supplier_id: Optional[str] = None
    supplier_service_id: Optional[str] = None
    platform: str
    category: str
    name: str
    description: Optional[str] = None
    type: str = "Default"
    rate: float
    supplier_rate: float = 0.0
    min: int = 10
    max: int = 100000
    active: bool = True


class ServiceUpdate(BaseModel):
    supplier_id: Optional[str] = None
    supplier_service_id: Optional[str] = None
    platform: Optional[str] = None
    category: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None
    rate: Optional[float] = None
    supplier_rate: Optional[float] = None
    min: Optional[int] = None
    max: Optional[int] = None
    active: Optional[bool] = None


# ---------- Orders ----------
class Order(BaseModel):
    order_id: str
    user_id: str
    service_id: str
    service_name: str
    platform: str
    link: str
    quantity: int
    charge: float
    status: str = "Pending"  # Pending|In Progress|Processing|Completed|Partial|Canceled
    start_count: int = 0
    remains: int = 0
    supplier_id: Optional[str] = None
    supplier_order_id: Optional[str] = None
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class OrderCreate(BaseModel):
    service_id: str
    link: str
    quantity: int


# ---------- Payments ----------
class PaymentTransaction(BaseModel):
    tx_id: str
    user_id: str
    provider: str  # 'stripe' | 'paypal'
    session_id: Optional[str] = None
    amount: float
    currency: str = "usd"
    status: str = "initiated"  # initiated|pending|paid|failed|expired|canceled
    payment_status: Optional[str] = None
    metadata: Dict[str, Any] = {}
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class StripeCheckoutRequest(BaseModel):
    amount: float = Field(gt=0)
    origin_url: str


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    balance: Optional[float] = None
    status: Optional[str] = None


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    role: str = "user"
    balance: float = 0.0


class BalanceAdjust(BaseModel):
    amount: float  # positive = add, negative = deduct
    note: Optional[str] = None
