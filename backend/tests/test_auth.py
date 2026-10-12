from tests.helpers import PASSWORD, auth, make_user


def test_register_login_and_me(client):
    res = client.post(
        "/api/v1/auth/register",
        json={
            "name": "Nadia Putri",
            "email": "Nadia@Example.com",
            "password": "secret123",
            "role": "instructor",
        },
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["user"]["email"] == "nadia@example.com"
    assert body["user"]["role"] == "student"  # role dari klien diabaikan (ADR-008)

    res = client.post("/api/v1/auth/login", json={"email": "nadia@example.com", "password": "secret123"})
    assert res.status_code == 200
    token = res.json()["token"]
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert me["name"] == "Nadia Putri" and me["status"] == "Active"


def test_register_ignores_role_and_rejects_duplicate_email(client, db):
    make_user(db, email="taken@test.dev")
    res = client.post(
        "/api/v1/auth/register",
        json={"name": "Eve Admin", "email": "x@test.dev", "password": "secret123", "role": "admin"},
    )
    assert res.status_code == 201 and res.json()["user"]["role"] == "student"
    res = client.post("/api/v1/auth/register", json={"name": "Eve", "email": "taken@test.dev", "password": "secret123"})
    assert res.status_code == 409 and res.json()["error"]["fields"]["email"]


def test_register_validates_password(client):
    res = client.post("/api/v1/auth/register", json={"name": "Weak Pw", "email": "w@test.dev", "password": "short"})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "VALIDATION"


def test_login_wrong_password_and_inactive(client, db):
    user = make_user(db, email="a@test.dev")
    res = client.post("/api/v1/auth/login", json={"email": "a@test.dev", "password": "nope12345"})
    assert res.status_code == 401 and res.json()["error"]["code"] == "INVALID_CREDENTIALS"
    make_user(db, email="off@test.dev", active=False)
    res = client.post("/api/v1/auth/login", json={"email": "off@test.dev", "password": PASSWORD})
    assert res.status_code == 403 and res.json()["error"]["code"] == "ACCOUNT_INACTIVE"
    assert client.post("/api/v1/auth/login", json={"email": user.email, "password": PASSWORD}).status_code == 200


def test_me_requires_valid_token_and_active_user(client, db):
    assert client.get("/api/v1/auth/me").status_code == 401
    assert client.get("/api/v1/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401
    user = make_user(db)
    headers = auth(user)
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 200
    user.is_active = False
    db.commit()
    res = client.get("/api/v1/auth/me", headers=headers)
    assert res.status_code == 401 and res.json()["error"]["code"] == "ACCOUNT_INACTIVE"


def test_change_password(client, db):
    user = make_user(db)
    headers = auth(user)
    res = client.post("/api/v1/auth/password", json={"current": "wrong", "next": "newpass123"}, headers=headers)
    assert res.status_code == 400 and "current" in res.json()["error"]["fields"]
    res = client.post("/api/v1/auth/password", json={"current": PASSWORD, "next": "newpass123"}, headers=headers)
    assert res.status_code == 200
    assert client.post("/api/v1/auth/login", json={"email": user.email, "password": "newpass123"}).status_code == 200


def test_update_profile_and_stats(client, db):
    user = make_user(db)
    res = client.patch("/api/v1/me", json={"name": "Alex Mércer"}, headers=auth(user))
    assert res.status_code == 200 and res.json()["name"] == "Alex Mércer"
    res = client.patch("/api/v1/me", json={"name": "A1"}, headers=auth(user))
    assert res.status_code == 400 and "name" in res.json()["error"]["fields"]
    stats = client.get("/api/v1/me/stats", headers=auth(user)).json()
    assert stats == {
        "role": "student",
        "courses": 0,
        "inProgress": 0,
        "completed": 0,
        "certificates": 0,
        "avgProgress": 0,
    }
    assert "gpa" not in stats
    assert client.get("/api/v1/me/stats").status_code == 401


def test_logout_is_stateless(client):
    assert client.post("/api/v1/auth/logout").json() == {"ok": True}
