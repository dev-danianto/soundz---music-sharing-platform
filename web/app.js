// Banyak Dead code di sini karena fitur yang belum selesai atau dihapus.

// ===== STATE =====
let currentUser = null;
let currentSongs = [];
let currentFavorites = [];
let currentSongIndex = 0;
let isPlaying = false;
let currentPendingUpload = null;

const audioPlayer = document.getElementById("audioPlayer");
const progressBar = document.getElementById("progressBar");
const playBtn = document.getElementById("playBtn");
const favoriteBtn = document.getElementById("favoriteBtn");

// ===== PAGE NAVIGATION =====
function goToLanding() {
  document.getElementById("landingPage").classList.remove("hidden");
  document.getElementById("loginPage").classList.add("hidden");
  document.getElementById("registerPage").classList.add("hidden");
  document.getElementById("dashboardPage").classList.add("hidden");
}

function goToLogin() {
  document.getElementById("landingPage").classList.add("hidden");
  document.getElementById("loginPage").classList.remove("hidden");
  document.getElementById("registerPage").classList.add("hidden");
  document.getElementById("dashboardPage").classList.add("hidden");
}

function goToRegister() {
  document.getElementById("landingPage").classList.add("hidden");
  document.getElementById("loginPage").classList.add("hidden");
  document.getElementById("registerPage").classList.remove("hidden");
  document.getElementById("dashboardPage").classList.add("hidden");
}

function goToDashboard() {
  document.getElementById("landingPage").classList.add("hidden");
  document.getElementById("loginPage").classList.add("hidden");
  document.getElementById("registerPage").classList.add("hidden");
  document.getElementById("dashboardPage").classList.remove("hidden");
}

// ===== AUTHENTICATION =====
async function handleLogin() {
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value.trim();

  if (!username || !password) {
    alert("Please fill all fields");
    return;
  }

  // Simple local storage login (untuk demo)
  const users = JSON.parse(localStorage.getItem("users") || "{}");

  if (users[username] && users[username].password === password) {
    currentUser = username;
    localStorage.setItem("currentUser", username);

    document.getElementById(
      "userDisplay"
    ).textContent = `Welcome, ${username}!`;
    document.getElementById("loginUsername").value = "";
    document.getElementById("loginPassword").value = "";

    goToDashboard();
    loadAllSongs();
    loadPlaylists();
    showDashboardSection("library");
  } else {
    alert("Invalid username or password");
  }
}

async function handleRegister() {
  const username = document.getElementById("regUsername").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value.trim();

  if (!username || !email || !password) {
    alert("Please fill all fields");
    return;
  }

  const users = JSON.parse(localStorage.getItem("users") || "{}");

  if (users[username]) {
    alert("Username already exists");
    return;
  }

  users[username] = { email, password };
  localStorage.setItem("users", JSON.stringify(users));

  alert("Account created successfully! Please login.");
  document.getElementById("regUsername").value = "";
  document.getElementById("regEmail").value = "";
  document.getElementById("regPassword").value = "";

  goToLogin();
}

function handleLogout() {
  currentUser = null;
  localStorage.removeItem("currentUser");
  goToLanding();
}

// ===== INITIALIZATION =====
window.addEventListener("load", () => {
  const savedUser = localStorage.getItem("currentUser");
  if (savedUser) {
    currentUser = savedUser;
    document.getElementById(
      "userDisplay"
    ).textContent = `Welcome, ${savedUser}!`;
    goToDashboard();
    loadAllSongs();
    loadPlaylists();
    showDashboardSection("library");
  }

  setupAudioListeners();
});

// ===== AUDIO LISTENERS =====
function setupAudioListeners() {
  audioPlayer.addEventListener("timeupdate", () => {
    if (audioPlayer.duration) {
      progressBar.value =
        (audioPlayer.currentTime / audioPlayer.duration) * 100;
      updateTimeDisplay();
    }
  });

  audioPlayer.addEventListener("ended", () => {
    // Bisa auto-play next song di sini
  });

  progressBar.addEventListener("input", (e) => {
    audioPlayer.currentTime = (e.target.value / 100) * audioPlayer.duration;
  });
}

function updateTimeDisplay() {
  const mins = Math.floor(audioPlayer.currentTime / 60);
  const secs = Math.floor(audioPlayer.currentTime % 60);
  document.getElementById("currentTime").textContent = `${mins}:${secs
    .toString()
    .padStart(2, "0")}`;
  document.getElementById("duration").textContent = formatTime(
    audioPlayer.duration || 0
  );
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// ===== LOAD DATA FROM DATABASE =====
async function loadAllSongs() {
  const result = await eel.get_all_songs()();
  if (result.status === "success") {
    currentSongs = result.data;
    displaySongs(currentSongs, "songsList");
  }
}

async function loadPlaylists() {
  const result = await eel.get_all_playlists()();
  if (result.status === "success") {
    displayPlaylists(result.data);
  }
}

async function loadFavorites() {
  const result = await eel.get_favorites()();
  if (result.status === "success") {
    currentFavorites = result.data;
    displaySongs(currentFavorites, "favoritesList");
  }
}

// ===== DISPLAY FUNCTIONS =====
function displaySongs(songs, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = songs
    .map(
      (song) => `
        <div class="bg-gray-800 p-4 rounded-lg hover:bg-gray-700 transition cursor-pointer group" 
             onclick="playSong(${song.song_id})">
            <div class="relative mb-4 overflow-hidden rounded">
                <img src="${
                  song.cover_data
                    ? song.cover_data
                    : "https://via.placeholder.com/200"
                }" alt="${
        song.title
      }" class="w-full aspect-square object-cover group-hover:scale-110 transition">
                <button class="absolute bottom-2 right-2 bg-green-500 text-black p-3 rounded-full opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition" 
                    onclick="event.stopPropagation(); playSong(${
                      song.song_id
                    })">
                    <i class="fas fa-play"></i>
                </button>
            </div>
            <p class="font-bold truncate">${song.title}</p>
            <p class="text-sm text-gray-400 truncate">${song.artist}</p>
            <p class="text-xs text-gray-500">${song.genre}</p>
        </div>
    `
    )
    .join("");
}

function displayPlaylists(playlists) {
  const container = document.getElementById("playlistsContent");
  container.innerHTML = playlists
    .map(
      (playlist) => `
        <div class="bg-gray-800 p-4 rounded-lg hover:bg-gray-700 transition cursor-pointer" onclick="loadPlaylistSongs(${
          playlist.playlist_id
        })">
            <div class="mb-4 bg-gradient-to-br from-purple-500 to-pink-500 aspect-square rounded flex items-center justify-center">
                <i class="fas fa-music text-4xl text-white"></i>
            </div>
            <p class="font-bold">${playlist.playlist_name}</p>
            <p class="text-sm text-gray-400">${
              playlist.song_count || 0
            } songs</p>
        </div>
    `
    )
    .join("");

  const sidebarContainer = document.getElementById("playlistsList");
  sidebarContainer.innerHTML = playlists
    .map(
      (playlist) => `
        <button onclick="loadPlaylistSongs(${playlist.playlist_id})" class="w-full text-left py-2 px-4 rounded text-sm hover:bg-gray-800 transition truncate">
            ${playlist.playlist_name}
        </button>
    `
    )
    .join("");
}

// ===== SECTION NAVIGATION =====
function showDashboardSection(section) {
  // Hide all sections
  document.getElementById("librarySection").classList.add("hidden");
  document.getElementById("uploadSection").classList.add("hidden");
  document.getElementById("playlistsSection").classList.add("hidden");
  document.getElementById("favoritesSection").classList.add("hidden");

  // Show selected section
  document.getElementById(section + "Section").classList.remove("hidden");

  // Update title
  const titles = {
    library: "Library",
    upload: "Upload Song",
    playlists: "Your Playlists",
    favorites: "Your Favorites",
  };
  document.getElementById("sectionTitle").textContent = titles[section];

  if (section === "favorites") {
    loadFavorites();
  }
}

// ===== UPLOAD FUNCTIONS =====
document.getElementById("uploadAudio").addEventListener("change", (e) => {
  document.getElementById("audioFileName").textContent =
    e.target.files[0]?.name || "";
});

document.getElementById("uploadCover").addEventListener("change", (e) => {
  document.getElementById("coverFileName").textContent =
    e.target.files[0]?.name || "";
});

async function uploadSong() {
  const audioFile = document.getElementById("uploadAudio").files[0];
  const coverFile = document.getElementById("uploadCover").files[0];
  const title = document.getElementById("uploadTitle").value.trim();
  const artist = document.getElementById("uploadArtist").value.trim();
  const genre = document.getElementById("uploadGenre").value.trim();
  const album = document.getElementById("uploadAlbum").value.trim();

  if (!audioFile || !title || !artist) {
    alert("Please fill required fields");
    return;
  }

  const status = document.getElementById("uploadStatus");
  status.innerHTML =
    '<p class="text-blue-400">⏳ Converting audio to Base64...</p>';

  // Read audio as Base64
  const audioReader = new FileReader();
  audioReader.onload = async (e) => {
    const audioBase64 = e.target.result;
    let coverBase64 = "";

    status.innerHTML =
      '<p class="text-blue-400">⏳ Processing cover image...</p>';

    if (coverFile) {
      const coverReader = new FileReader();
      coverReader.onload = async (e2) => {
        coverBase64 = e2.target.result;

        // Get duration
        const audio = new Audio(audioBase64);
        audio.onloadedmetadata = () => {
          currentPendingUpload = {
            title,
            artist,
            genre,
            album,
            duration: Math.floor(audio.duration),
            audioBase64,
            coverBase64,
          };
          showDescriptionModal();
        };
      };
      coverReader.readAsDataURL(coverFile);
    } else {
      const audio = new Audio(audioBase64);
      audio.onloadedmetadata = () => {
        currentPendingUpload = {
          title,
          artist,
          genre,
          album,
          duration: Math.floor(audio.duration),
          audioBase64,
          coverBase64,
        };
        showDescriptionModal();
      };
    }
  };
  audioReader.readAsDataURL(audioFile);
}

function showDescriptionModal() {
  document.getElementById("descriptionModal").classList.remove("hidden");
  document.getElementById("base64Status").textContent =
    "✅ Audio converted to Base64 successfully";
}

function closeDescriptionModal() {
  document.getElementById("descriptionModal").classList.add("hidden");
  document.getElementById("songDescription").value = "";
}

async function completeSongUpload() {
  if (!currentPendingUpload) return;

  const description = document.getElementById("songDescription").value;
  const status = document.getElementById("uploadStatus");

  status.innerHTML = '<p class="text-blue-400">⏳ Saving to database...</p>';

  const result = await eel.save_song(
    currentPendingUpload.title,
    currentPendingUpload.artist,
    currentPendingUpload.genre,
    currentPendingUpload.album,
    currentPendingUpload.duration,
    currentPendingUpload.audioBase64,
    currentPendingUpload.coverBase64
  )();

  if (result.status === "success") {
    status.innerHTML =
      '<p class="text-green-400">✅ Song uploaded successfully!</p>';

    // Clear form
    document.getElementById("uploadTitle").value = "";
    document.getElementById("uploadArtist").value = "";
    document.getElementById("uploadGenre").value = "";
    document.getElementById("uploadAlbum").value = "";
    document.getElementById("uploadAudio").value = "";
    document.getElementById("uploadCover").value = "";
    document.getElementById("audioFileName").textContent = "";
    document.getElementById("coverFileName").textContent = "";

    closeDescriptionModal();
    loadAllSongs();

    setTimeout(() => {
      status.innerHTML = "";
    }, 3000);
  } else {
    status.innerHTML = `<p class="text-red-400">❌ Error: ${result.message}</p>`;
  }
}

// ===== PLAYER FUNCTIONS =====
async function playSong(songId) {
  const result = await eel.get_song(songId)();

  if (result.status === "success") {
    const song = result.data;
    audioPlayer.src = song.audio_data; // Base64 langsung
    document.getElementById("playerTitle").textContent = song.title;
    document.getElementById("playerArtist").textContent = song.artist;

    if (song.cover_data) {
      document.getElementById("playerCover").src = song.cover_data;
    }

    audioPlayer.play();
    isPlaying = true;
    updatePlayButton();
  }
}

function togglePlay() {
  if (audioPlayer.paused) {
    audioPlayer.play();
    isPlaying = true;
  } else {
    audioPlayer.pause();
    isPlaying = false;
  }
  updatePlayButton();
}

function updatePlayButton() {
  playBtn.innerHTML = isPlaying
    ? '<i class="fas fa-pause text-xl"></i>'
    : '<i class="fas fa-play text-xl"></i>';
}

async function toggleFavorite() {
  // Add to favorites logic
  favoriteBtn.classList.toggle("text-red-500");
}

// ===== SEARCH FUNCTION =====
async function searchSongs() {
  const query = document.getElementById("searchBox").value.trim();
  if (query.length > 0) {
    const result = await eel.search_songs(query)();
    if (result.status === "success") {
      displaySongs(result.data, "songsList");
    }
  } else {
    displaySongs(currentSongs, "songsList");
  }
}

// ===== PLAYLIST FUNCTIONS =====
function showCreatePlaylistModal() {
  document.getElementById("playlistModal").classList.remove("hidden");
}

function closePlaylistModal() {
  document.getElementById("playlistModal").classList.add("hidden");
  document.getElementById("playlistName").value = "";
  document.getElementById("playlistDesc").value = "";
}

async function createPlaylist() {
  const name = document.getElementById("playlistName").value.trim();
  const desc = document.getElementById("playlistDesc").value.trim();

  if (!name) {
    alert("Enter playlist name");
    return;
  }

  const result = await eel.create_playlist(name, desc)();

  if (result.status === "success") {
    closePlaylistModal();
    loadPlaylists();
    alert("Playlist created!");
  } else {
    alert("Error: " + result.message);
  }
}

async function loadPlaylistSongs(playlistId) {
  const result = await eel.get_playlist_songs(playlistId)();

  if (result.status === "success") {
    displaySongs(result.data, "songsList");
    showDashboardSection("library");
  }
}
