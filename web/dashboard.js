// State global
let currentUser = localStorage.getItem("user_id");
let currentSongs = [];
let currentSong = null; // Objek lagu saat ini untuk playback
let isSongLoaded = false;
let isMinimized = false;
let currentSongIndex = -1;
const audioPlayer = document.getElementById("audioPlayer");
const progressBar = document.getElementById("progressBar");
const miniProgress = document.getElementById("miniProgress");
const playBtn = document.getElementById("playBtn");
const miniPlayBtn = document.getElementById("miniPlayBtn");
const fullPlayer = document.getElementById("fullPlayer");
const miniPlayer = document.getElementById("miniPlayer");

// Fix loop refresh: Cek sesi saat load dashboard
async function initDashboard() {
  console.log("🔍 Memulai inisialisasi dashboard...");
  const userId = localStorage.getItem("user_id");
  if (!userId) {
    console.log("❌ Tidak ada sesi lokal, redirect ke login");
    showNotification("Sesi tidak ditemukan. Silakan login lagi.", "error");
    window.location.href = "auth.html"; // Atau index.html untuk login
    return;
  }

  try {
    console.log("🔄 Memeriksa sesi backend...");
    const sessionCheck = await eel.check_session(userId)();
    if (sessionCheck.status === "success") {
      console.log("✅ Sesi valid, memuat konten");
      currentUser = userId;
      loadLibrary(); // Muat library setelah sesi valid
      section("lib"); // Default ke library
    } else {
      console.log("❌ Sesi backend invalid, hapus lokal dan redirect");
      localStorage.removeItem("user_id");
      localStorage.removeItem("username");
      localStorage.removeItem("email");
      showNotification(sessionCheck.message, "error");
      window.location.href = "auth.html";
    }
  } catch (error) {
    console.error("❌ Error cek sesi:", error);
    showNotification("Koneksi ke server gagal. Coba lagi.", "error");
    // Tidak redirect otomatis, beri opsi retry
    document.getElementById("lib").innerHTML = `
      <div class="text-center py-8">
        <i class="fas fa-exclamation-triangle text-yellow-400 text-4xl mb-4"></i>
        <p class="text-gray-400 mb-4">Koneksi gagal. Tekan tombol di bawah untuk coba lagi.</p>
        <button onclick="initDashboard()" class="bg-yellow-500 text-black px-6 py-2 rounded-xl">Coba Lagi</button>
      </div>
    `;
  }
}

// Fungsi notifikasi sederhana
function showNotification(message, type = "info") {
  const notification = document.createElement("div");
  notification.className = `fixed top-4 right-4 p-4 rounded-xl shadow-lg z-50 ${
    type === "error"
      ? "bg-red-900/80 text-red-200"
      : "bg-green-900/80 text-green-200"
  }`;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 5000);
}

// Load library setelah sesi valid
async function loadLibrary() {
  try {
    const result = await eel.get_all_songs()();
    if (result.status === "success") {
      currentSongs = result.data;
      displaySongs(currentSongs, "lib");
    } else {
      showNotification(result.message || "Gagal memuat lagu", "error");
      document.getElementById("lib").innerHTML = `
        <div class="text-center py-8">
          <p class="text-gray-400">Tidak ada lagu tersedia. ${result.message}</p>
        </div>
      `;
    }
  } catch (error) {
    console.error("Error load library:", error);
    showNotification("Gagal memuat library. Coba lagi.", "error");
  }
}

function displaySongs(songs, sectionId) {
  const container = document.getElementById(sectionId);
  container.innerHTML = songs
    .map(
      (song) => `
    <div class="bg-gray-900 rounded-xl p-4 cursor-pointer hover:bg-gray-800 transition-all duration-200 active:scale-95 shadow-sm" onclick="playSong(${
      song.song_id
    })">
      <img src="${song.cover_data || "https://via.placeholder.com/200"}" alt="${
        song.title
      }" class="w-full h-32 object-cover rounded-lg mb-3 shadow-md">
      <h3 class="font-semibold text-sm truncate">${song.title}</h3>
      <p class="text-xs text-gray-400">${song.artist}</p>
      <p class="text-xs text-gray-500">${song.genre || "Unknown"}</p>
    </div>
  `
    )
    .join("");
}

async function searchSongs() {
  const query = document.getElementById("search").value;
  if (query.length < 2) {
    loadLibrary(); // Reset ke all songs
    return;
  }
  try {
    const result = await eel.search_songs(query)();
    if (result.status === "success") {
      displaySongs(result.data, "lib");
    }
  } catch (error) {
    console.error("Search error:", error);
  }
}

function section(id) {
  // Hide all sections
  document
    .querySelectorAll("#lib, #pl, #fav")
    .forEach((s) => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
  document.getElementById("sectionTitle").textContent =
    id === "lib" ? "Library" : id === "pl" ? "Playlists" : "Favorites";

  if (id === "pl") loadPlaylists();
  if (id === "fav") loadFavorites();
}

async function loadPlaylists() {
  const userId = localStorage.getItem("user_id");
  if (!userId) return;
  try {
    const result = await eel.get_user_playlists(userId)();
    if (result.status === "success") {
      const grid = document.getElementById("playlistsGrid");
      grid.innerHTML = result.data
        .map(
          (pl) => `
        <div class="bg-gray-900 rounded-xl p-4 cursor-pointer hover:bg-gray-800" onclick="loadPlaylist(${
          pl.playlist_id
        })">
          <h3 class="font-semibold text-sm">${pl.playlist_name}</h3>
          <p class="text-xs text-gray-400">${
            pl.description || "No description"
          }</p>
          <p class="text-xs text-gray-500">${pl.song_count} songs</p>
        </div>
      `
        )
        .join("");
    }
  } catch (error) {
    console.error("Load playlists error:", error);
  }
}

async function loadFavorites() {
  const userId = localStorage.getItem("user_id");
  if (!userId) return;
  try {
    const result = await eel.get_user_favorites(userId)();
    if (result.status === "success") {
      displaySongs(result.data, "fav");
    }
  } catch (error) {
    console.error("Load favorites error:", error);
  }
}

async function createPlaylist() {
  const userId = localStorage.getItem("user_id");
  const name = document.getElementById("playlistName").value;
  const desc = document.getElementById("playlistDesc").value;
  if (!name) return showNotification("Nama playlist diperlukan", "error");

  try {
    const result = await eel.create_playlist(userId, name, desc)();
    if (result.status === "success") {
      showNotification("Playlist dibuat!", "success");
      closePlaylistModal();
      loadPlaylists();
    } else {
      showNotification(result.message, "error");
    }
  } catch (error) {
    console.error("Create playlist error:", error);
  }
}

async function loadPlaylist(playlistId) {
  try {
    const result = await eel.get_playlist_songs(playlistId)();
    if (result.status === "success") {
      displaySongs(result.data, "lib"); // Tampilkan di library untuk simplicity
      section("lib");
    }
  } catch (error) {
    console.error("Load playlist error:", error);
  }
}

function showUploadModal() {
  document.getElementById("uploadModal").classList.remove("hidden");
}

function closeUploadModal() {
  document.getElementById("uploadModal").classList.add("hidden");
  document.getElementById("uploadForm").reset();
  document.getElementById("audioName").textContent = "Choose audio file";
  document.getElementById("coverName").textContent = "Choose cover image";
  document.getElementById("progress").classList.add("hidden");
}

function showPlaylistModal() {
  document.getElementById("playlistModal").classList.remove("hidden");
}

function closePlaylistModal() {
  document.getElementById("playlistModal").classList.add("hidden");
  document.getElementById("playlistName").value = "";
  document.getElementById("playlistDesc").value = "";
}

async function upload(event) {
  event.preventDefault();
  const userId = localStorage.getItem("user_id");
  if (!userId) {
    showNotification("Sesi tidak valid. Login lagi.", "error");
    return;
  }

  const title = document.getElementById("title").value;
  const artist = document.getElementById("artist").value;
  const genre = document.getElementById("genre").value;
  const album = document.getElementById("album").value;
  const audioFile = document.getElementById("audio").files[0];
  const coverFile = document.getElementById("cover").files[0];

  if (!audioFile) {
    showNotification("File audio diperlukan", "error");
    return;
  }

  // Konversi ke base64 TANPA prefix untuk simpan di DB (lebih efisien)
  const audioData = await fileToBase64WithoutPrefix(audioFile);
  const coverData = coverFile
    ? await fileToBase64WithoutPrefix(coverFile)
    : null;

  try {
    const result = await eel.save_song(
      userId,
      title,
      artist,
      genre,
      album,
      audioData,
      coverData
    )();
    if (result.status === "success") {
      showNotification("Lagu diunggah!", "success");
      closeUploadModal();
      loadLibrary();
    } else {
      showNotification(result.message, "error");
    }
  } catch (error) {
    console.error("Upload error:", error);
    showNotification("Gagal unggah. Coba lagi.", "error");
  }
}

function fileToBase64WithoutPrefix(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64 = reader.result.split(",")[1]; // Ambil hanya base64 part
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
}

// Fix Playback: Ambil detail lagu, buat Blob URL dengan MIME deteksi, log error
async function playSong(songId) {
  try {
    console.log(`🔄 Memuat lagu ${songId} untuk playback...`);
    const result = await eel.get_song(songId)();
    if (result.status === "success" && result.data.audio_data) {
      currentSong = result.data;
      isSongLoaded = true;

      // Deteksi MIME dari ekstensi atau default MP3
      const mimeType = getMimeType(currentSong.title || "song.mp3");
      console.log(`📁 MIME type: ${mimeType} untuk ${currentSong.title}`);

      // Buat Blob dari base64 (hindari src panjang)
      const audioBlob = base64ToBlob(currentSong.audio_data, mimeType);
      const blobUrl = URL.createObjectURL(audioBlob);
      console.log(
        "✅ Audio Blob dibuat, URL:",
        blobUrl.substring(0, 50) + "..."
      );

      // Set src ke blob URL
      audioPlayer.src = blobUrl;

      // Update UI
      updatePlayerUI();

      // Play lagu (user gesture diperlukan untuk audio policy)
      await audioPlayer.play().catch((e) => {
        console.error("❌ Play error (mungkin autoplay blocked):", e);
        showNotification("Klik play manual untuk mulai musik.", "info");
      });

      playBtn.innerHTML = '<i class="fas fa-pause"></i>';
      miniPlayBtn.innerHTML = '<i class="fas fa-pause"></i>';

      // Tampilkan player
      fullPlayer.classList.remove("hidden");
      miniPlayer.classList.add("hidden");

      console.log("✅ Lagu mulai diputar:", currentSong.title);
      showNotification(`Memutar: ${currentSong.title}`, "success");
    } else {
      console.error("❌ No audio_data:", result);
      showNotification("Data audio tidak tersedia untuk lagu ini.", "error");
    }
  } catch (error) {
    console.error("❌ Error playback:", error);
    showNotification("Gagal memutar lagu. Pastikan file audio valid.", "error");
  }
}

function getMimeType(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  const mimeMap = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
  };
  return mimeMap[ext] || "audio/mpeg"; // Default MP3
}

function base64ToBlob(base64, mimeType) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

function togglePlay() {
  if (isSongLoaded && currentSong) {
    if (audioPlayer.paused) {
      audioPlayer.play().catch((e) => {
        console.error("❌ Manual play error:", e);
        showNotification("Gagal play. Cek console.", "error");
      });
      playBtn.innerHTML = '<i class="fas fa-pause"></i>';
      miniPlayBtn.innerHTML = '<i class="fas fa-pause"></i>';
    } else {
      audioPlayer.pause();
      playBtn.innerHTML = '<i class="fas fa-play"></i>';
      miniPlayBtn.innerHTML = '<i class="fas fa-play"></i>';
    }
  }
}

function previousSong() {
  if (currentSongIndex > 0 && isSongLoaded) {
    currentSongIndex--;
    playSong(currentSongs[currentSongIndex].song_id);
  }
}

function nextSong() {
  if (currentSongIndex < currentSongs.length - 1 && isSongLoaded) {
    currentSongIndex++;
    playSong(currentSongs[currentSongIndex].song_id);
  }
}

function togglePlayerSize() {
  isMinimized = !isMinimized;
  if (isMinimized) {
    fullPlayer.classList.add("hidden");
    miniPlayer.classList.remove("hidden");
  } else {
    fullPlayer.classList.remove("hidden");
    miniPlayer.classList.add("hidden");
  }
}

function toggleFavorite() {
  // Implement toggle favorite logic jika diperlukan
  console.log(
    "Toggle favorite untuk:",
    currentSong ? currentSong.title : "No song"
  );
}

function updatePlayerUI() {
  if (currentSong) {
    document.getElementById("playerTitle").textContent = currentSong.title;
    document.getElementById("playerArtist").textContent = currentSong.artist;
    document.getElementById("miniTitle").textContent = currentSong.title;
    document.getElementById("miniArtist").textContent = currentSong.artist;
    document.getElementById("playerCover").src = currentSong.cover_data
      ? `data:image/jpeg;base64,${currentSong.cover_data}`
      : "https://via.placeholder.com/50";
    document.getElementById("miniCover").src = currentSong.cover_data
      ? `data:image/jpeg;base64,${currentSong.cover_data}`
      : "https://via.placeholder.com/40";
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  if (sidebar.classList.contains("-translate-x-full")) {
    sidebar.classList.remove("-translate-x-full");
    overlay.classList.remove("hidden");
  } else {
    sidebar.classList.add("-translate-x-full");
    overlay.classList.add("hidden");
  }
}

async function logout() {
  const userId = localStorage.getItem("user_id");
  if (userId) {
    try {
      await eel.logout_user(userId)();
    } catch (error) {
      console.error("Logout error:", error);
    }
  }
  // Hapus sesi lokal hanya untuk Soundz
  localStorage.removeItem("user_id");
  localStorage.removeItem("username");
  localStorage.removeItem("email");
  // Reset player: revoke blob URL jika ada
  if (audioPlayer.src.startsWith("blob:")) {
    URL.revokeObjectURL(audioPlayer.src);
  }
  audioPlayer.pause();
  audioPlayer.src = "";
  isSongLoaded = false;
  showNotification("Logout berhasil", "success");
  window.location.href = "auth.html";
}

// Audio events untuk progress dan time, plus error handling
audioPlayer.addEventListener("loadedmetadata", () => {
  if (currentSong) {
    console.log("✅ Metadata loaded, duration:", audioPlayer.duration);
    document.getElementById("duration").textContent = formatTime(
      audioPlayer.duration
    );
  }
});

audioPlayer.addEventListener("error", (e) => {
  console.error("❌ Audio error:", e);
  showNotification("Error audio: File corrupt atau format salah.", "error");
});

audioPlayer.addEventListener("timeupdate", () => {
  if (isSongLoaded) {
    const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
    progressBar.value = progress;
    miniProgress.value = progress;
    document.getElementById("currentTime").textContent = formatTime(
      audioPlayer.currentTime
    );
  }
});

// Handle progress bar click untuk seek
progressBar.addEventListener("input", (e) => {
  if (isSongLoaded) {
    const seekTime = (e.target.value / 100) * audioPlayer.duration;
    audioPlayer.currentTime = seekTime;
  }
});

miniProgress.addEventListener("input", (e) => {
  if (isSongLoaded) {
    const seekTime = (e.target.value / 100) * audioPlayer.duration;
    audioPlayer.currentTime = seekTime;
  }
});

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Inisialisasi saat load
window.addEventListener("load", initDashboard);
