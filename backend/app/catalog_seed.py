"""Comprehensive service catalog seed for SocialBoost Pro.
Generates ~250 curated service variations across all platforms.
Uses deterministic service_ids based on (platform, category, variant) hash so
idempotent re-seed is safe.
"""
import uuid
import hashlib
from datetime import datetime, timezone


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def _sid(platform: str, category: str, variant: str) -> str:
    h = hashlib.md5(f"{platform}|{category}|{variant}".encode()).hexdigest()[:12]
    return f"svc_{h}"


# ------- Quality variants per category (rate multipliers vs base) -------
# (variant_key, display_label, rate_mult, min, max, type_tag, description_suffix)
FOLLOWER_VARIANTS = [
    ("instant",      "Instant — HQ",                1.00, 100, 100000, "Default",        "instant start, high-quality accounts"),
    ("real",         "Real — High Retention",       1.60, 50,  50000,  "Default",        "real accounts, 30-day refill"),
    ("premium",      "Premium — No-Drop",           2.20, 100, 50000,  "Premium",        "zero-drop guarantee, lifetime refill"),
    ("country-usa",  "USA Targeted",                3.10, 100, 20000,  "Country-Target", "US-based profiles only"),
    ("country-br",   "Brazil Targeted",             2.40, 100, 20000,  "Country-Target", "Brazil-based profiles"),
    ("country-in",   "India Targeted",              1.40, 100, 50000,  "Country-Target", "India-based profiles"),
    ("dripfeed",     "Drip-Feed (slow, safe)",      1.80, 500, 200000, "Drip-Feed",      "drip-feed 100-500/day for safety"),
    ("female",       "Female — Gender Targeted",    2.80, 100, 10000,  "Gender-Target",  "female-only profiles"),
]
LIKE_VARIANTS = [
    ("instant",     "Instant Likes",              1.00, 50,  200000, "Default",   "instant start, no login required"),
    ("real",        "Real Likes — HR",            1.40, 50,  100000, "Default",   "real engagement, high retention"),
    ("premium",     "Premium — No-Drop",          1.90, 100, 50000,  "Premium",   "lifetime refill guarantee"),
    ("country-usa", "USA Targeted Likes",         2.30, 50,  30000,  "Country-Target","US-based likes only"),
    ("auto",        "Auto-Likes (next 10 posts)", 2.00, 100, 10000,  "Auto",      "applies to next N new posts"),
]
VIEW_VARIANTS = [
    ("instant",        "Instant Views",               1.00, 100, 10000000, "Default",   "instant start"),
    ("hr",             "High Retention Views",        1.30, 500, 5000000,  "Default",   "avg watch time 30s+"),
    ("monetized",      "Monetized / AdSense-safe",    2.40, 500, 1000000,  "Premium",   "safe for monetized channels"),
    ("country-usa",    "USA Targeted Views",          2.10, 500, 1000000, "Country-Target","US-based viewers"),
    ("watchtime",      "Watch-Time Hours (bulk)",     5.50, 100, 5000,     "Watch-Time","1 = 1 watch hour"),
]
COMMENT_VARIANTS = [
    ("random",  "Random Emoji Comments", 1.80, 10, 2000, "Default",         "mix of emoji + short text"),
    ("custom",  "Custom Comments",       5.00, 10, 500,  "Custom Comments", "you provide the text"),
    ("positive","Positive Comments",     3.20, 10, 1000, "Default",         "positive sentiment only"),
]
SHARE_VARIANTS = [
    ("instant", "Instant Shares",        1.00, 50, 200000, "Default", "real shares"),
    ("country-usa", "USA Targeted Shares", 2.10, 50, 30000, "Country-Target", "US users only"),
]
SAVE_VARIANTS = [
    ("instant", "Instant Saves",         1.20, 50, 100000, "Default", "profile save signal"),
]
MEMBERS_VARIANTS = [
    ("real", "Real Members",        1.00, 100, 50000, "Default", "real profiles"),
    ("premium", "Premium No-Drop",  1.90, 100, 30000, "Premium", "no-drop guarantee"),
]
SUBSCRIBER_VARIANTS = [
    ("instant",   "Subscribers — HQ",              1.00, 50,  50000, "Default", "high-quality accounts"),
    ("premium",   "Subscribers — Monetization Safe", 2.10, 50,  20000, "Premium", "safe for monetization"),
]


# ------- Platform base rates (USD per 1000, supplier cost) -------
# (platform, label, category, base_supplier_rate, default_markup, variants)
CATALOG = [
    # Instagram
    ("instagram",  "Followers",      0.65, 2.2, FOLLOWER_VARIANTS),
    ("instagram",  "Likes",          0.18, 2.5, LIKE_VARIANTS),
    ("instagram",  "Views",          0.06, 2.5, VIEW_VARIANTS[:3]),
    ("instagram",  "Comments",       1.60, 2.4, COMMENT_VARIANTS),
    ("instagram",  "Saves",          0.20, 2.0, SAVE_VARIANTS),
    ("instagram",  "Shares",         0.35, 2.0, SHARE_VARIANTS),
    ("instagram",  "Story Views",    0.25, 2.0, [("instant", "Story Views", 1.0, 100, 50000, "Default", "views on latest story")]),
    ("instagram",  "Impressions",    0.15, 2.0, [("instant", "Impressions", 1.0, 500, 1000000, "Default", "post impressions")]),
    ("instagram",  "Profile Visits", 0.30, 2.0, [("instant", "Profile Visits", 1.0, 100, 50000, "Default", "profile visits")]),
    ("instagram",  "Live Viewers",   3.50, 1.8, [("instant", "Live Viewers (15-30 min)", 1.0, 50, 5000, "Live", "live stream viewers")]),

    # TikTok
    ("tiktok",     "Followers",      0.90, 2.0, FOLLOWER_VARIANTS),
    ("tiktok",     "Likes",          0.14, 2.5, LIKE_VARIANTS),
    ("tiktok",     "Views",          0.03, 2.5, VIEW_VARIANTS[:3]),
    ("tiktok",     "Shares",         0.40, 2.0, SHARE_VARIANTS),
    ("tiktok",     "Saves",          0.30, 2.0, SAVE_VARIANTS),
    ("tiktok",     "Comments",       1.80, 2.2, COMMENT_VARIANTS),
    ("tiktok",     "Live Viewers",   2.80, 1.8, [("instant", "Live Viewers (15-30 min)", 1.0, 50, 10000, "Live", "tiktok live viewers")]),

    # YouTube
    ("youtube",    "Views",          0.70, 2.0, VIEW_VARIANTS),
    ("youtube",    "Likes",          0.55, 2.2, LIKE_VARIANTS[:3]),
    ("youtube",    "Subscribers",    2.20, 2.0, SUBSCRIBER_VARIANTS),
    ("youtube",    "Comments",       2.50, 2.2, COMMENT_VARIANTS),
    ("youtube",    "Watch-Time",     5.50, 1.8, [("watchtime", "Watch-Time Hours (bulk)", 1.0, 100, 5000, "Watch-Time", "1 = 1 watch hour")]),
    ("youtube",    "Shorts Views",   0.18, 2.2, [("instant", "Shorts Views", 1.0, 500, 2000000, "Default", "instant shorts views")]),
    ("youtube",    "Live Viewers",   4.50, 1.8, [("instant", "Live Stream Viewers (30 min)", 1.0, 50, 10000, "Live", "live concurrent viewers")]),
    ("youtube",    "Shares",         0.45, 2.0, SHARE_VARIANTS),

    # Facebook
    ("facebook",   "Page Likes",     1.10, 2.0, LIKE_VARIANTS),
    ("facebook",   "Followers",      0.95, 2.0, FOLLOWER_VARIANTS[:5]),
    ("facebook",   "Post Likes",     0.28, 2.2, LIKE_VARIANTS),
    ("facebook",   "Video Views",    0.05, 2.4, VIEW_VARIANTS[:3]),
    ("facebook",   "Post Shares",    0.55, 2.0, SHARE_VARIANTS),
    ("facebook",   "Comments",       2.20, 2.2, COMMENT_VARIANTS),
    ("facebook",   "Group Members",  1.50, 2.0, MEMBERS_VARIANTS),
    ("facebook",   "Event Going",    1.20, 2.0, [("instant", "Event 'Going' Responses", 1.0, 50, 20000, "Default", "event attendance clicks")]),

    # Twitter / X
    ("twitter",    "Followers",      1.80, 2.0, FOLLOWER_VARIANTS[:5]),
    ("twitter",    "Likes",          0.35, 2.2, LIKE_VARIANTS[:3]),
    ("twitter",    "Retweets",       0.80, 2.0, [("instant", "Retweets", 1.0, 50, 50000, "Default", "retweets from real accounts")]),
    ("twitter",    "Views",          0.04, 2.5, VIEW_VARIANTS[:3]),
    ("twitter",    "Replies",        2.20, 2.2, COMMENT_VARIANTS),
    ("twitter",    "Impressions",    0.10, 2.0, [("instant", "Impressions", 1.0, 500, 5000000, "Default", "tweet impressions")]),

    # LinkedIn
    ("linkedin",   "Followers",      1.80, 2.2, [("instant", "Page Followers", 1.0, 100, 20000, "Default", "real profile followers")]),
    ("linkedin",   "Connections",    2.20, 2.2, [("instant", "Profile Connections", 1.0, 50, 10000, "Default", "real connection requests")]),
    ("linkedin",   "Post Likes",     0.75, 2.2, LIKE_VARIANTS[:3]),
    ("linkedin",   "Post Engagement",1.90, 2.2, [("instant", "Post Engagement Mix", 1.0, 50, 5000, "Default", "likes + comments + shares mix")]),

    # Telegram
    ("telegram",   "Channel Members", 0.60, 2.0, MEMBERS_VARIANTS),
    ("telegram",   "Group Members",  0.70, 2.0, MEMBERS_VARIANTS),
    ("telegram",   "Post Views",     0.02, 3.0, [("instant", "Post Views (auto N posts)", 1.0, 500, 1000000, "Default", "views on future posts")]),
    ("telegram",   "Post Reactions", 0.15, 2.5, [("instant", "Post Reactions (👍/❤️/🔥)", 1.0, 50, 50000, "Default", "positive reactions")]),

    # Spotify
    ("spotify",    "Plays",          0.70, 2.2, [("instant", "Track Plays", 1.0, 1000, 1000000, "Default", "real track plays"),
                                                 ("monetized", "Monetized Plays", 2.5, 1000, 500000, "Premium", "royalty-safe plays")]),
    ("spotify",    "Followers",      1.10, 2.2, [("instant", "Artist Followers", 1.0, 100, 50000, "Default", "real artist followers")]),
    ("spotify",    "Playlist Saves", 0.90, 2.0, SAVE_VARIANTS),
    ("spotify",    "Monthly Listeners", 1.20, 2.0, [("instant", "Monthly Listeners", 1.0, 1000, 500000, "Default", "monthly listener bump")]),

    # Discord
    ("discord",    "Server Members", 0.80, 2.2, MEMBERS_VARIANTS),
    ("discord",    "Online Members", 1.40, 2.2, [("instant", "Online Members (24h)", 1.0, 50, 5000, "Default", "online-status members")]),

    # Twitch
    ("twitch",     "Followers",      0.80, 2.2, FOLLOWER_VARIANTS[:3]),
    ("twitch",     "Channel Views",  0.05, 2.5, [("instant", "Channel Views", 1.0, 500, 1000000, "Default", "channel page views")]),
    ("twitch",     "Live Viewers",   2.80, 1.8, [("instant", "Live Viewers (30 min)", 1.0, 10, 5000, "Live", "concurrent live viewers"),
                                                 ("instant-60", "Live Viewers (60 min)", 2.0, 10, 3000, "Live", "1-hour concurrent viewers")]),

    # Website / App / Other
    ("website",    "Traffic",        0.08, 2.5, [("instant", "Website Traffic (global)", 1.0, 500, 1000000, "Default", "worldwide visitors"),
                                                 ("country-usa", "USA Targeted Traffic", 2.5, 500, 500000, "Country-Target", "US visitors only"),
                                                 ("seo", "SEO Signals (social)", 3.0, 100, 50000, "SEO", "social-signal backlinks")]),
    ("app",        "App Installs",   2.20, 2.0, [("ios", "iOS App Installs", 1.0, 100, 50000, "iOS", "real iOS device installs"),
                                                 ("android", "Android App Installs", 0.9, 100, 50000, "Android", "real Android device installs"),
                                                 ("reviews", "App Store Reviews (5★)", 3.5, 10, 2000, "Review", "positive reviews")]),
    ("whatsapp",   "Channel Members",1.20, 2.0, MEMBERS_VARIANTS),
    ("pinterest",  "Followers",      1.00, 2.0, [("instant", "Pinterest Followers", 1.0, 50, 20000, "Default", "real followers")]),
    ("pinterest",  "Repins",         0.60, 2.0, [("instant", "Repins", 1.0, 50, 50000, "Default", "repins on selected pin")]),
    ("snapchat",   "Followers",      1.80, 2.0, [("instant", "Snapchat Followers", 1.0, 100, 20000, "Default", "real followers")]),
    ("snapchat",   "Views",          0.10, 2.5, [("instant", "Story Views", 1.0, 500, 1000000, "Default", "story views")]),
    ("threads",    "Followers",      2.20, 2.0, [("instant", "Threads Followers", 1.0, 100, 20000, "Default", "real followers")]),
    ("threads",    "Likes",          0.40, 2.2, [("instant", "Post Likes", 1.0, 50, 50000, "Default", "post likes")]),
]


async def seed_expanded_catalog(db):
    """Idempotent expanded catalog seed. Only inserts services that don't exist yet
    (matched by deterministic service_id). Preserves any admin edits on existing rows."""
    inserted = 0
    for platform, category, base_cost, markup, variants in CATALOG:
        for vkey, vlabel, rate_mult, mn, mx, vtype, vdesc in variants:
            service_id = _sid(platform, category, vkey)
            existing = await db.services.find_one({"service_id": service_id}, {"_id": 0, "service_id": 1})
            if existing:
                continue
            supplier_rate = round(base_cost * rate_mult, 4)
            rate = round(supplier_rate * markup, 4)
            name = f"{platform.title()} {category} — {vlabel}"
            if platform == "twitter":
                name = f"X (Twitter) {category} — {vlabel}"
            if platform == "website":
                name = f"Website {category} — {vlabel}"
            if platform == "app":
                name = f"App {category} — {vlabel}"
            await db.services.insert_one({
                "service_id": service_id,
                "supplier_id": "sup_mock_default",
                "supplier_service_id": f"mock-{service_id[-8:]}",
                "platform": platform,
                "category": category,
                "name": name,
                "description": f"{category} · {vdesc}",
                "type": vtype,
                "rate": rate,
                "supplier_rate": supplier_rate,
                "min": mn,
                "max": mx,
                "active": True,
                "drip_feed": vtype == "Drip-Feed",
                "refill_supported": vtype in ("Premium", "Default"),
                "cancel_supported": vtype != "Premium",
                "avg_time_hours": 12 if vtype == "Drip-Feed" else 2,
                "created_at": now_iso(),
            })
            inserted += 1
    return inserted
