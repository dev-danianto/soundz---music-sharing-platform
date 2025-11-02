import eel
import psycopg2
from psycopg2.extras import RealDictCursor
import os
from dotenv import load_dotenv
import hashlib
import traceback
import socket
import sys  # Added for sys.exit to fix NameError

load_dotenv()

# ===== FUNGSI GANTI PORT KALO DIPAKE, PORT TAI KENAPA DIPAKE MULU =====
def is_port_available(port):
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)
        result = sock.connect_ex(('localhost', port))
        sock.close()
        return result != 0
    except:
        return False

#===== PORT PORT PORT PORT PORT PORT ======
def find_available_port(start_port=8000, max_port=8100):
    for port in range(start_port, max_port):
        if is_port_available(port):
            return port
    return None

# ===== EEL INIT =====
eel.init('web')

#DOTENV JANGAN HAPUS NANTI ERROR, MALAS BUKA DASHBOARD NEON LAGI
DATABASE_URL = os.getenv('DATABASE_URL')

# ===== TEMPLATE NEON JANGAN SENTUH ======
def get_db_connection():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

# ===== TEMPLATE AUTH NEON JANGAN HAPUS=====
@eel.expose
def register_user(username, email, password):
    conn = get_db_connection()
    if not conn:
        return {"status": "error", "message": "Database error"}
    try:
        cur = conn.cursor()
        cur.execute("SELECT user_id FROM users WHERE username = %s OR email = %s", (username, email))
        if cur.fetchone():
            conn.close()
            return {"status": "error", "message": "Username/email exists"}
        
        pwd_hash = hash_password(password)
        cur.execute("""
            INSERT INTO users (username, email, password_hash)
            VALUES (%s, %s, %s) RETURNING user_id
        """, (username, email, pwd_hash))
        user_id = cur.fetchone()[0]
        conn.commit()
        conn.close()
        return {"status": "success", "user_id": user_id, "username": username}
    except Exception as e:
        print(f"❌ Register error: {e}")
        traceback.print_exc()
        conn.close()
        return {"status": "error", "message": str(e)}

@eel.expose
def login_user(username, password):
    conn = get_db_connection()
    if not conn:
        return {"status": "error"}
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        pwd_hash = hash_password(password)
        cur.execute("""
            SELECT user_id, username, email FROM users
            WHERE username = %s AND password_hash = %s AND is_active = TRUE
        """, (username, pwd_hash))
        user = cur.fetchone()
        conn.close()
        if user:
            return {"status": "success", "data": dict(user)}
        return {"status": "error"}
    except Exception as e:
        print(f"❌ Login error: {e}")
        conn.close()
        return {"status": "error"}

# ===== SONGS =====
@eel.expose
def save_song(user_id, title, artist, genre, album, audio_data, cover_data=""):
    conn = get_db_connection()
    if not conn:
        return {"status": "error"}
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO songs (user_id, title, artist, genre, album, duration, audio_data, cover_data)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING song_id
        """, (user_id, title, artist, genre, album, 0, audio_data, cover_data))
        song_id = cur.fetchone()[0]
        conn.commit()
        conn.close()
        return {"status": "success", "song_id": song_id}
    except Exception as e:
        print(f"❌ Save song error: {e}")
        conn.close()
        return {"status": "error"}

@eel.expose
def get_all_songs():
    conn = get_db_connection()
    if not conn:
        return {"status": "error"}
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT song_id, title, artist, album, cover_data, audio_data
            FROM songs ORDER BY created_at DESC
        """)
        songs = cur.fetchall()
        conn.close()
        return {"status": "success", "data": [dict(s) for s in songs]}
    except Exception as e:
        print(f"❌ Get songs error: {e}")
        conn.close()
        return {"status": "error"}

@eel.expose
def get_song(song_id):
    conn = get_db_connection()
    if not conn:
        return {"status": "error"}
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT * FROM songs WHERE song_id = %s
        """, (song_id,))
        song = cur.fetchone()
        conn.close()
        if song:
            return {"status": "success", "data": dict(song)}
        return {"status": "error"}
    except Exception as e:
        print(f"❌ Get song error: {e}")
        conn.close()
        return {"status": "error"}

@eel.expose
def search_songs(query):
    conn = get_db_connection()
    if not conn:
        return {"status": "error"}
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        term = f"%{query}%"
        cur.execute("""
            SELECT song_id, title, artist, album, cover_data, audio_data
            FROM songs WHERE LOWER(title) LIKE LOWER(%s) OR LOWER(artist) LIKE LOWER(%s)
            LIMIT 50
        """, (term, term))
        songs = cur.fetchall()
        conn.close()
        return {"status": "success", "data": [dict(s) for s in songs]}
    except Exception as e:
        print(f"❌ Search error: {e}")
        conn.close()
        return {"status": "error"}

# ===== USER SONGS =====
@eel.expose
def get_user_songs(user_id):
    conn = get_db_connection()
    if not conn:
        return {"status": "error"}
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT song_id, title, artist, album, cover_data, audio_data
            FROM songs WHERE user_id = %s ORDER BY created_at DESC
        """, (user_id,))
        songs = cur.fetchall()
        conn.close()
        return {"status": "success", "data": [dict(s) for s in songs]}
    except Exception as e:
        print(f"❌ Get user songs error: {e}")
        conn.close()
        return {"status": "error"}

# ===== PLAYLISTS =====
@eel.expose
def create_playlist(user_id, playlist_name, description=""):
    conn = get_db_connection()
    if not conn:
        return {"status": "error"}
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO playlists (user_id, playlist_name, description)
            VALUES (%s, %s, %s) RETURNING playlist_id
        """, (user_id, playlist_name, description))
        playlist_id = cur.fetchone()[0]
        conn.commit()
        conn.close()
        return {"status": "success", "playlist_id": playlist_id}
    except Exception as e:
        print(f"❌ Create playlist error: {e}")
        conn.close()
        return {"status": "error"}

@eel.expose
def get_user_playlists(user_id):
    conn = get_db_connection()
    if not conn:
        return {"status": "error"}
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT p.playlist_id, p.playlist_name, p.description,
                   COUNT(ps.song_id) as song_count
            FROM playlists p
            LEFT JOIN playlist_songs ps ON p.playlist_id = ps.playlist_id
            WHERE p.user_id = %s
            GROUP BY p.playlist_id
            ORDER BY p.created_at DESC
        """, (user_id,))
        playlists = cur.fetchall()
        conn.close()
        return {"status": "success", "data": [dict(p) for p in playlists]}
    except Exception as e:
        print(f"❌ Get playlists error: {e}")
        conn.close()
        return {"status": "error"}

# ===== FAVORITES =====
@eel.expose
def add_favorite(user_id, song_id):
    conn = get_db_connection()
    if not conn:
        return {"status": "error"}
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO favorites (user_id, song_id) VALUES (%s, %s)
            ON CONFLICT DO NOTHING
        """, (user_id, song_id))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        print(f"❌ Add favorite error: {e}")
        conn.close()
        return {"status": "error"}

@eel.expose
def get_user_favorites(user_id):
    conn = get_db_connection()
    if not conn:
        return {"status": "error"}
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT s.song_id, s.title, s.artist, s.album, s.cover_data, s.audio_data
            FROM songs s JOIN favorites f ON s.song_id = f.song_id
            WHERE f.user_id = %s ORDER BY f.added_at DESC
        """, (user_id,))
        songs = cur.fetchall()
        conn.close()
        return {"status": "success", "data": [dict(s) for s in songs]}
    except Exception as e:
        print(f"❌ Get favorites error: {e}")
        conn.close()
        return {"status": "error"}

# ===== TEST & START =====
print("\n" + "="*60)
print("🎵 Soundz Server Starting...")
print("="*60)

try:
    conn = get_db_connection()
    if conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM users;")
        user_count = cur.fetchone()[0]
        conn.close()
        print(f"✅ Database connected - {user_count} users")
    else:
        print("❌ Database connection failed")
        sys.exit(1)  # Changed from exit(1)
except Exception as e:
    print(f"❌ Database test failed: {e}")
    sys.exit(1)  # Changed from exit(1)

# Find available port
available_port = find_available_port()
if not available_port:
    print("❌ No available port found (8000-8100)")
    sys.exit(1)  # Changed from exit(1)

print(f"✅ Using port: {available_port}")
print(f"🌐 http://localhost:{available_port}")
print("="*60 + "\n")

try:
    eel.start('index.html', port=available_port, size=(1400, 800), suppress_error=True)
except KeyboardInterrupt:
    print("\n✅ Server stopped by user")
except Exception as e:
    print(f"\n❌ Server error: {e}")
    traceback.print_exc()
