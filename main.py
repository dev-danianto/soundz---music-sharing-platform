import eel
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
import os
import sys
import traceback
import datetime
import bcrypt
import time
import socket
import base64
import json

# Buat folder uploads jika belum ada
os.makedirs('uploads', exist_ok=True)

# Load environment variables dengan retry
load_dotenv()
if not os.getenv('DB_HOST'):
    print("⚠️  .env tidak dimuat! Pastikan file .env ada di root proyek.")
    print("Contoh: DB_HOST=mpti-btsnet-id-01-devs-id-1.h.aivencloud.com")
    input("Tekan Enter setelah update .env...")
    load_dotenv(reload=True)

# Config DB dengan SSL untuk Aiven
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': int(os.getenv('DB_PORT', 5432)),
    'dbname': os.getenv('DB_NAME', 'postgres'),
    'user': os.getenv('DB_USER', 'postgres'),
    'password': os.getenv('DB_PASSWORD', ''),
    'sslmode': os.getenv('SSL_MODE', 'require'),
    'sslrootcert': os.getenv('CA_CERT_PATH')
}

# Log config non-sensitif
print(f"🔍 DB Config: host={DB_CONFIG['host']}, port={DB_CONFIG['port']}, db={DB_CONFIG['dbname']}, user={DB_CONFIG['user'][:3]}***")

# Session management (tetap untuk users)
active_sessions = {}  # {user_id: {'username': str, 'login_time': str}}

def get_db_connection(max_retries=3, delay=2):
    """Koneksi DB dengan retry logic"""
    for attempt in range(max_retries):
        try:
            conn_params = DB_CONFIG.copy()
            if 'sslrootcert' in conn_params and conn_params['sslrootcert']:
                conn_params['sslrootcert'] = conn_params['sslrootcert']
            
            print(f"🔄 Mencoba koneksi DB (percobaan {attempt + 1}/{max_retries})...")
            conn = psycopg2.connect(**conn_params)
            print("✅ Koneksi DB berhasil!")
            return conn
        except psycopg2.OperationalError as e:
            print(f"❌ Koneksi gagal (percobaan {attempt + 1}): {e}")
            if attempt < max_retries - 1:
                print(f"⏳ Retry dalam {delay} detik...")
                time.sleep(delay)
            else:
                print("❌ Maksimal retry tercapai. Jalankan tanpa DB (mode fallback).")
                return None
        except Exception as e:
            print(f"❌ Error tak terduga: {e}")
            return None
    return None

def hash_password(password):
    """Hash password dengan bcrypt"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password, hashed):
    """Verify password"""
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def clean_base64_data(data_str):
    """Bersihkan base64 dari prefix data URL jika ada, validasi panjang"""
    if not data_str:
        return None, "Data kosong"
    # Hapus prefix jika ada (e.g., 'data:audio/mp3;base64,')
    if data_str.startswith('data:'):
        data_str = data_str.split(',')[1]
    try:
        # Validasi base64
        decoded = base64.b64decode(data_str)
        print(f"✅ Base64 valid, panjang: {len(data_str)} chars ({len(decoded)} bytes)")
        if len(decoded) > 5_000_000:  # Limit 5MB untuk hindari overload
            print("⚠️  Data terlalu besar, gunakan fallback file")
            return None, "Terlalu besar"
        return data_str, "Valid"
    except Exception as e:
        print(f"❌ Invalid base64: {e}")
        return None, str(e)

def save_to_file(data_str, filename):
    """Simpan base64 sebagai file di uploads/ sebagai fallback"""
    try:
        clean_data, status = clean_base64_data(data_str)
        if not clean_data:
            return None, status
        decoded = base64.b64decode(clean_data)
        filepath = os.path.join('uploads', filename)
        with open(filepath, 'wb') as f:
            f.write(decoded)
        print(f"✅ File disimpan: {filepath} ({len(decoded)} bytes)")
        return filepath, "File saved"
    except Exception as e:
        print(f"❌ File save error: {e}")
        return None, str(e)

# Fungsi setup tables sesuai schema Anda + insert dummy jika kosong
def setup_tables():
    """Buat tabel sesuai schema Anda (jalankan sekali)"""
    conn = get_db_connection()
    if not conn:
        print("❌ Gagal setup: DB tidak tersedia")
        return False
    try:
        cur = conn.cursor()
        # Tabel songs sesuai schema Anda
        cur.execute("""
            CREATE TABLE IF NOT EXISTS songs (
                song_id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                artist VARCHAR(255) NOT NULL,
                genre VARCHAR(50),
                album VARCHAR(255),
                duration INTEGER,
                audio_data TEXT,
                cover_data TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Tabel playlists
        cur.execute("""
            CREATE TABLE IF NOT EXISTS playlists (
                playlist_id SERIAL PRIMARY KEY,
                playlist_name VARCHAR(255) NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Tabel playlist_songs
        cur.execute("""
            CREATE TABLE IF NOT EXISTS playlist_songs (
                playlist_song_id SERIAL PRIMARY KEY,
                playlist_id INTEGER NOT NULL REFERENCES playlists(playlist_id) ON DELETE CASCADE,
                song_id INTEGER NOT NULL REFERENCES songs(song_id) ON DELETE CASCADE,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(playlist_id, song_id)
            )
        """)
        # Tabel favorites (tambah user_id untuk konsistensi)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS favorites (
                favorite_id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
                song_id INTEGER NOT NULL REFERENCES songs(song_id) ON DELETE CASCADE,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, song_id)
            )
        """)
        # Tabel users (jika belum ada, untuk login)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
        
        # Insert dummy songs jika tabel kosong
        cur.execute("SELECT COUNT(*) FROM songs")
        count = cur.fetchone()[0]
        if count == 0:
            cur.execute("""
                INSERT INTO songs (title, artist, genre, album, duration) VALUES 
                ('Dummy Song 1', 'Test Artist', 'Pop', 'Demo Album', 180),
                ('Dummy Song 2', 'Rock Band', 'Rock', 'Rock Hits', 240)
            """)
            conn.commit()
            print("✅ Dummy songs diinsert (2 lagu)")
        else:
            print(f"✅ Tabel songs sudah ada {count} lagu")
        
        cur.close()
        conn.close()
        print("✅ Setup tables selesai sesuai schema Anda")
        return True
    except Exception as e:
        print(f"❌ Setup error: {e}")
        if conn:
            conn.rollback()
            conn.close()
        return False

# Eel exposed functions disesuaikan (hapus user_id dari songs/playlists)
@eel.expose
def register_user(username, email, password):
    """Registrasi user baru (untuk login)"""
    conn = get_db_connection()
    if not conn:
        return {"status": "error", "message": "DB tidak tersedia. Coba lagi nanti."}
    
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        pwd_hash = hash_password(password)
        
        cur.execute("""
            INSERT INTO users (username, email, password_hash)
            VALUES (%s, %s, %s) RETURNING user_id
        """, (username, email, pwd_hash))
        
        user_id = cur.fetchone()['user_id']
        cur.close()
        conn.commit()
        conn.close()
        return {"status": "success", "user_id": user_id}
    except Exception as e:
        print(f"❌ Register error: {e}")
        if conn:
            conn.rollback()
            conn.close()
        return {"status": "error", "message": str(e)}

@eel.expose
def login_user(username, password):
    """Login user dengan fix verifikasi"""
    conn = get_db_connection()
    if not conn:
        return {"status": "error", "message": "DB tidak tersedia. Coba lagi nanti."}
    
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        cur.execute("""
            SELECT user_id, username, email, password_hash
            FROM users WHERE username = %s AND is_active = TRUE
        """, (username,))
        user = cur.fetchone()
        
        if user and verify_password(password, user['password_hash']):
            user_id = user['user_id']
            active_sessions[user_id] = {
                'username': user['username'],
                'email': user['email'],
                'login_time': datetime.datetime.now().isoformat()
            }
            cur.close()
            conn.close()
            print(f"✅ User {username} logged in")
            return {"status": "success", "data": dict(user)}
        cur.close()
        conn.close()
        return {"status": "error", "message": "Username atau password salah"}
    except Exception as e:
        print(f"❌ Login error: {e}")
        if conn:
            conn.close()
        return {"status": "error", "message": str(e)}

@eel.expose
def check_session(user_id):
    """Cek session aktif"""
    session = active_sessions.get(int(user_id))
    if session:
        session['login_time'] = datetime.datetime.now().isoformat()
        return {"status": "success", "data": session}
    return {"status": "error", "message": "Session expired atau tidak valid"}

@eel.expose
def logout_user(user_id):
    """Logout user"""
    if int(user_id) in active_sessions:
        del active_sessions[int(user_id)]
        print(f"👋 User {user_id} logged out")
    return {"status": "success"}

@eel.expose
def get_all_songs():
    """Ambil semua lagu sesuai schema (tanpa user_id, tambah logging)"""
    print("🔍 Memanggil get_all_songs...")
    conn = get_db_connection()
    if not conn:
        print("❌ DB tidak tersedia - return dummy songs")
        return {
            "status": "success", 
            "data": [
                {"song_id": 1, "title": "Dummy Song 1", "artist": "Test Artist", "genre": "Pop", "album": "Demo", "duration": 180, "cover_data": None}
            ], 
            "message": "Mode fallback (no DB)"
        }
    
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT song_id, title, artist, genre, album, duration, cover_data
            FROM songs ORDER BY created_at DESC
        """)
        songs = cur.fetchall()
        print(f"✅ Query songs: {len(songs)} hasil")
        if not songs:
            print("⚠️  Tabel songs kosong - insert dummy?")
        cur.close()
        conn.close()
        return {"status": "success", "data": [dict(s) for s in songs]}
    except Exception as e:
        print(f"❌ Get songs error: {e} - return dummy")
        if conn:
            conn.close()
        return {
            "status": "success", 
            "data": [
                {"song_id": 999, "title": "Error Fallback Song", "artist": "System", "genre": "Error", "album": "Debug", "duration": 0, "cover_data": None}
            ], 
            "message": f"DB error: {str(e)}"
        }

@eel.expose
def get_song(song_id):
    """Ambil detail lagu sesuai schema (audio_data dari TEXT)"""
    conn = get_db_connection()
    if not conn:
        return {"status": "error", "message": "DB tidak tersedia"}
    
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT * FROM songs WHERE song_id = %s
        """, (song_id,))
        song = cur.fetchone()
        if song:
            song['audio_data'], _ = clean_base64_data(song['audio_data']) if song['audio_data'] else (None, "No data")
            print(f"✅ Song {song_id}: {song['title']}, audio: {len(song['audio_data']) if song['audio_data'] else 0} chars")
            cur.close()
            conn.close()
            return {"status": "success", "data": dict(song)}
        cur.close()
        conn.close()
        return {"status": "error", "message": "Lagu tidak ditemukan"}
    except Exception as e:
        print(f"❌ Get song error: {e}")
        if conn:
            conn.close()
        return {"status": "error", "message": str(e)}

@eel.expose
def save_song(title, artist, genre, album, audio_data, cover_data):
    """Simpan lagu tanpa user_id sesuai schema"""
    conn = get_db_connection()
    if not conn:
        return {"status": "error", "message": "DB tidak tersedia"}
    
    try:
        clean_audio, audio_status = clean_base64_data(audio_data)
        if not clean_audio:
            filename = f"song_{int(time.time())}.mp3"
            audio_file_path, file_status = save_to_file(audio_data, filename)
            if not audio_file_path:
                return {"status": "error", "message": f"Audio invalid: {audio_status} | {file_status}"}
            # Simpan path jika perlu, tapi schema tidak punya kolom—skip atau tambah kolom
            print(f"⚠️  Schema tanpa audio_file_path; gunakan base64 saja")
        
        clean_cover, _ = clean_base64_data(cover_data) if cover_data else (None, "No cover")
        
        # Hitung duration sederhana (dummy 180s; gunakan library seperti mutagen untuk real)
        duration = 180
        
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            INSERT INTO songs (title, artist, genre, album, duration, audio_data, cover_data)
            VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING song_id
        """, (title, artist, genre, album, duration, clean_audio, clean_cover))
        
        song_id = cur.fetchone()['song_id']
        cur.close()
        conn.commit()
        conn.close()
        print(f"✅ Song {song_id} disimpan tanpa user_id")
        return {"status": "success", "song_id": song_id}
    except Exception as e:
        print(f"❌ Save song error: {e}")
        if conn:
            conn.rollback()
            conn.close()
        return {"status": "error", "message": str(e)}

# Fungsi playlists tanpa user_id
@eel.expose
def get_user_playlists():
    """Ambil semua playlists (global sesuai schema)"""
    conn = get_db_connection()
    if not conn:
        return {"status": "error", "data": [], "message": "DB tidak tersedia"}
    
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT p.playlist_id, p.playlist_name, p.description,
                   COUNT(ps.song_id) as song_count
            FROM playlists p
            LEFT JOIN playlist_songs ps ON p.playlist_id = ps.playlist_id
            GROUP BY p.playlist_id
            ORDER BY p.created_at DESC
        """)
        playlists = cur.fetchall()
        cur.close()
        conn.close()
        return {"status": "success", "data": [dict(p) for p in playlists]}
    except Exception as e:
        print(f"❌ Get playlists error: {e}")
        if conn:
            conn.close()
        return {"status": "error", "data": []}

@eel.expose
def create_playlist(name, description):
    """Buat playlist global"""
    conn = get_db_connection()
    if not conn:
        return {"status": "error", "message": "DB tidak tersedia"}
    
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            INSERT INTO playlists (playlist_name, description)
            VALUES (%s, %s) RETURNING playlist_id
        """, (name, description))
        
        playlist_id = cur.fetchone()['playlist_id']
        cur.close()
        conn.commit()
        conn.close()
        return {"status": "success", "playlist_id": playlist_id}
    except Exception as e:
        print(f"❌ Create playlist error: {e}")
        if conn:
            conn.rollback()
            conn.close()
        return {"status": "error", "message": str(e)}

# Favorites dengan user_id (per-user)
@eel.expose
def get_user_favorites(user_id):
    """Ambil favorites per-user"""
    conn = get_db_connection()
    if not conn:
        return {"status": "error", "data": [], "message": "DB tidak tersedia"}
    
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT s.* FROM songs s
            JOIN favorites f ON s.song_id = f.song_id
            WHERE f.user_id = %s
            ORDER BY f.added_at DESC
        """, (user_id,))
        favorites = cur.fetchall()
        cur.close()
        conn.close()
        return {"status": "success", "data": [dict(f) for f in favorites]}
    except Exception as e:
        print(f"❌ Get favorites error: {e}")
        if conn:
            conn.close()
        return {"status": "error", "data": []}

@eel.expose
def search_songs(query):
    """Search lagu"""
    conn = get_db_connection()
    if not conn:
        return {"status": "error", "data": [], "message": "DB tidak tersedia"}
    
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT * FROM songs
            WHERE title ILIKE %s OR artist ILIKE %s
            ORDER BY created_at DESC
        """, (f'%{query}%', f'%{query}%'))
        songs = cur.fetchall()
        cur.close()
        conn.close()
        return {"status": "success", "data": [dict(s) for s in songs]}
    except Exception as e:
        print(f"❌ Search error: {e}")
        if conn:
            conn.close()
        return {"status": "error", "data": []}

@eel.expose
def get_playlist_songs(playlist_id):
    """Ambil lagu di playlist"""
    conn = get_db_connection()
    if not conn:
        return {"status": "error", "data": [], "message": "DB tidak tersedia"}
    
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT s.* FROM songs s
            JOIN playlist_songs ps ON s.song_id = ps.song_id
            WHERE ps.playlist_id = %s
            ORDER BY ps.added_at DESC
        """, (playlist_id,))
        songs = cur.fetchall()
        cur.close()
        conn.close()
        return {"status": "success", "data": [dict(s) for s in songs]}
    except Exception as e:
        print(f"❌ Get playlist songs error: {e}")
        if conn:
            conn.close()
        return {"status": "error", "data": []}

def find_available_port(start_port=8000):
    """Cari port kosong"""
    port = start_port
    while port < 9000:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('localhost', port)) != 0:
                return port
        port += 1
    return None

if __name__ == "__main__":
    print("\n" + "="*60)
    print("🎵 Soundz Music App - Server Starting...")
    print("="*60)
    
    # Setup tables sesuai schema (jalankan sekali)
    if input("Jalankan setup tables sesuai schema? (y/n): ").lower() == 'y':
        setup_tables()
    
    # Test DB
    conn = get_db_connection()
    db_available = conn is not None
    if db_available:
        conn.close()
        print("✅ DB connected!")
    else:
        print("⚠️  DB tidak tersedia - fallback mode")
    
    # Count songs
    if db_available:
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM songs")
            print(f"📊 Total songs: {cur.fetchone()[0]}")
            cur.close()
            conn.close()
        except Exception as e:
            print(f"⚠️  Count error: {e}")
    
    port = find_available_port()
    if not port:
        print("❌ No port available. Keluar.")
        sys.exit(1)
    
    print(f"\n✅ Port: {port} | http://localhost:{port}")
    print("="*60 + "\n")
    
    eel.init('web')
    try:
        eel.start('index.html', port=port, size=(1400, 800), suppress_error=True)
    except KeyboardInterrupt:
        print("\n✅ Server stopped")
    except Exception as e:
        print(f"\n❌ Server error: {e}")
        traceback.print_exc()
