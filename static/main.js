
        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        // NOTE: Firestore is imported but not actively used for data persistence in this specific SPA view implementation.
        // We initialize it here for completeness in the Canvas environment.
        import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

        // --- Configuration ---
        const BASE_URL = 'http://127.0.0.1:5000'; // Flask API base URL
        const GEMINI_API_KEY = ""; // Required for Gemini API calls
        const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
        const MAX_RETRIES = 5;

        // --- Firebase Globals and Setup ---
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
        const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

        let app;
        let auth;
        let db;
        let currentUserId = null;
        let currentPage = 'doctors'; // Initial page view
        
        // --- ROLE SIMULATION STATE ---
        let currentRole = 'patient'; // Can be 'patient' or 'doctor'
        let currentUserName = 'Guest'; // Display name

        // --- DOM Elements ---
        const allDoctors = [
            { id: 1, name: "Dr. Sandeep Srivastava", specialties: ["Cardiologist", "Interventional Cardiology"], location: "Indore", phone: "123-456-7890", image: "https://placehold.co/40x40/F0F8FF/1e40af?text=SS" },
            { id: 2, name: "Dr. R.K. Sodani", specialties: ["Neurologist", "Epilepsy Specialist"], location: "Los Angeles", phone: "123-456-7891", image: "https://placehold.co/40x40/E6F2FF/1e40af?text=RS" },
            { id: 3, name: "Dr. Z.S. Rana", specialties: ["Orthopedic Surgeon", "Joint Replacement"], location: "Indore", phone: "123-456-7892", image: "https://placehold.co/40x40/A2CFFD/1e40af?text=ZR" },
            { id: 4, name: "Dr. Abha Jain", specialties: ["Dermatologist", "Cosmetic Dermatology"], location: "Indore", phone: "123-456-7893", image: "https://placehold.co/40x40/D291BC/1e40af?text=AJ" },
            { id: 5, name: "Dr. Sanjay Porwal", specialties: ["Pediatrician", "Neurotology"], location: "Los Angeles", phone: "123-456-7894", image: "https://placehold.co/40x40/C3D898/1e40af?text=SP" },
        ];
        
        const doctorAppointments = [
            { id: 101, time: '09:00 AM', patient: 'Aarav K.', reason: 'Post-operative check-up', status: 'Confirmed', isVideo: false },
            { id: 102, time: '10:30 AM', patient: 'Priya S.', reason: 'Chronic migraine consultation', status: 'Confirmed', isVideo: true },
            { id: 103, time: '11:00 AM', patient: 'Vihan D.', reason: 'Follow-up on sleep disorder', status: 'Canceled', isVideo: false },
            { id: 104, time: '02:00 PM', patient: 'Rani T.', reason: 'New patient neurological assessment', status: 'Confirmed', isVideo: true },
        ];


        const appContent = document.getElementById('app-content');
        const authControls = document.getElementById('auth-controls');
        const authModal = document.getElementById('auth-modal');
        const formSignIn = document.getElementById('form-signin');
        const formSignUp = document.getElementById('form-signup');
        const tabSignIn = document.getElementById('tab-signin');
        const tabSignUp = document.getElementById('tab-signup');
        const doctorRegistrationModal = document.getElementById('doctor-registration-modal');
        let currentFilters = { specialty: 'All Specializations' };


        // --- Utility Functions ---

        /**
         * Generic fetch function with exponential backoff for retries.
         */
        async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
            try {
                const response = await fetch(url, options);
                if (!response.ok) {
                    const errorBody = await response.json().catch(() => ({ message: 'Unknown error' }));
                    throw new Error(`HTTP error! status: ${response.status}, message: ${errorBody.message}`);
                }
                return response;
            } catch (error) {
                if (retries === 0) {
                    console.error("Max retries reached. Failing request:", error);
                    throw error;
                }
                const delay = Math.pow(2, MAX_RETRIES - retries) * 1000;
                console.warn(`Request failed. Retrying in ${delay}ms... (Retries left: ${retries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return fetchWithRetry(url, options, retries - 1);
            }
        }


        window.showMessage = function(text, type = 'success') {
            const main = document.querySelector('main');
            let msgElement = document.getElementById('app-message');
            if (!msgElement) {
                msgElement = document.createElement('div');
                msgElement.id = 'app-message';
                msgElement.className = 'fixed top-20 right-4 p-4 rounded-xl shadow-lg z-50 transition-opacity duration-300';
                main.appendChild(msgElement);
            }

            let bgColor = '';
            let icon = '';

            if (type === 'success') {
                bgColor = 'bg-success';
                icon = `<i data-lucide="check-circle" class="w-5 h-5 mr-2"></i>`;
            } else if (type === 'info') {
                bgColor = 'bg-primary';
                icon = `<i data-lucide="info" class="w-5 h-5 mr-2"></i>`;
            } else {
                bgColor = 'bg-red-600';
                icon = `<i data-lucide="x-circle" class="w-5 h-5 mr-2"></i>`;
            }

            msgElement.className = `fixed top-20 right-4 p-4 rounded-xl shadow-lg z-50 text-white flex items-center ${bgColor} transition-opacity duration-300 opacity-100`;
            msgElement.innerHTML = icon + text;

            setTimeout(() => {
                msgElement.classList.remove('opacity-100');
                msgElement.classList.add('opacity-0');
                setTimeout(() => { if (msgElement.parentNode) msgElement.remove(); }, 300); 
                lucide.createIcons();
            }, 3000);
        }
        
        /**
         * Simulates changing the user role for testing the different dashboards.
         */
        window.simulateRoleChange = function() {
            if (currentRole === 'patient') {
                currentRole = 'doctor';
                currentUserName = 'Dr. Jane Foster';
                showMessage('Switched to Doctor Dashboard view!', 'info');
            } else {
                currentRole = 'patient';
                currentUserName = 'Alex J. Rivera';
                showMessage('Switched to Patient Dashboard view!', 'info');
            }
            // Re-render UI elements dependent on role
            updateAuthUI(auth.currentUser); 
            if (currentPage === 'dashboard' || currentPage === 'profile') {
                setView('dashboard');
            } else {
                // If not on dashboard, just re-render UI
                lucide.createIcons();
            }
        }


        // --- Core SPA Navigation ---

        function updateNavLinks() {
            document.querySelectorAll('.nav-link').forEach(link => {
                link.classList.remove('border-b-2', 'border-primary');
                if (link.id === `nav-${currentPage}`) {
                    link.classList.add('border-b-2', 'border-primary');
                }
            });
        }

        window.setView = function(view) {
            currentPage = view;
            renderPage();
            updateNavLinks();
            window.scrollTo(0, 0); // Scroll to top on navigation
        }
        
        function renderPage() {
            appContent.innerHTML = '';
            let pageHtml = '';
            
            switch (currentPage) {
                case 'doctors':
                    pageHtml = renderDoctorsView();
                    break;
                case 'symptom-checker':
                    pageHtml = renderSymptomChecker();
                    break;
                case 'health-feed':
                    pageHtml = renderHealthFeed();
                    break;
                case 'my-schedule':
                    pageHtml = renderMySchedule();
                    break;
                case 'dashboard':
                    pageHtml = renderDashboard(); // This function now branches based on role
                    break;
                case 'profile':
                    pageHtml = renderProfileView();
                    break;
                default:
                    pageHtml = renderDoctorsView(); // Default to Doctors
            }

            appContent.innerHTML = pageHtml;
            lucide.createIcons();
            addEventListeners();
        }
        
        // --- Page Render Functions ---

        function renderDoctorsView() {
            const specialtyOptions = allDoctors.flatMap(d => d.specialties).filter((value, index, self) => self.indexOf(value) === index);
            const specialtyHtml = specialtyOptions.map(spec => 
                `<option value="${spec}" ${currentFilters.specialty === spec ? 'selected' : ''}>${spec}</option>`
            ).join('');

            // The doctor grid content will be filled by filterDoctors()
            setTimeout(filterDoctors, 0); 

            return `
                <header class="text-center mb-10 mt-10">
                    <h1 class="text-3xl font-normal text-gray-800 mb-2">Find a Doctor</h1>
                    <p class="text-lg text-gray-500">Your trusted partner in finding healthcare in India.</p>
                </header>

                <!-- Filter Bar -->
                <section class="mb-10 flex flex-col sm:flex-row justify-center space-y-4 sm:space-y-0 sm:space-x-4">
                    <button id="near-me-button" class="flex items-center justify-center bg-primary text-white px-5 py-2.5 rounded-lg font-medium shadow-md hover:bg-blue-800 transition duration-150 text-sm">
                        <i data-lucide="compass" class="w-4 h-4 mr-2"></i>
                        Find Doctors Near Me
                    </button>
                    <div class="relative">
                        <select id="specialty-filter" class="w-full sm:w-48 px-4 py-2.5 border border-gray-300 rounded-lg bg-white appearance-none pr-10 focus:border-primary focus:ring-primary focus:ring-1 transition duration-150 text-sm text-gray-700">
                            <option value="All Specializations">All Specializations</option>
                            ${specialtyHtml}
                        </select>
                        <i data-lucide="chevron-down" class="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none"></i>
                    </div>
                </section>

                <!-- Doctor Listing Grid -->
                <section>
                    <div id="doctor-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <!-- Doctor Cards will be rendered here by filterDoctors() -->
                        <div class="col-span-full text-center py-10 text-gray-400">Loading doctors...</div>
                    </div>
                </section>
            `;
        }

        function renderSymptomChecker() {
            return `
                <header class="text-center mb-10 mt-10">
                    <h1 class="text-3xl font-normal text-gray-800 mb-2">AI Symptom Checker</h1>
                    <p class="text-lg text-gray-500">Describe your symptoms and our AI assistant will provide possible insights.</p>
                </header>

                <div class="max-w-3xl mx-auto bg-white rounded-xl p-6 md:p-10 card-shadow space-y-6">
                    <form id="symptom-checker-form" onsubmit="handleSymptomSubmit(event)">
                        <div>
                            <label for="symptoms-input" class="block text-lg font-medium text-gray-700 mb-2">What are your symptoms?</label>
                            <textarea id="symptoms-input" rows="5" required placeholder="E.g., I have had a persistent mild fever for three days, coupled with a headache and fatigue. No vomiting or severe pain."
                                class="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-success focus:border-success resize-none text-base"></textarea>
                        </div>
                        <button type="submit" id="symptom-submit-btn" class="w-full py-3 mt-6 px-4 border border-transparent rounded-lg shadow-md text-base font-medium text-white bg-success hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-success transition duration-150 flex items-center justify-center">
                            <i data-lucide="brain" class="w-5 h-5 mr-2"></i>
                            Analyze Symptoms
                        </button>
                    </form>

                    <!-- AI Results Section -->
                    <div id="ai-results-card" class="hidden border border-gray-200 rounded-xl p-6 bg-gray-50 mt-8">
                        <h3 class="text-xl font-semibold text-primary mb-4 flex items-center">
                            <i data-lucide="bot" class="w-5 h-5 mr-2"></i>
                            AI Assistant Report
                        </h3>
                        <div id="ai-response-content" class="text-gray-700 space-y-4">
                            <!-- AI response will be injected here -->
                        </div>
                        <div id="ai-response-sources" class="text-xs text-gray-500 mt-4 border-t pt-3">
                            <!-- Sources will be injected here -->
                        </div>
                    </div>
                </div>
            `;
        }

        function renderHealthFeed() {
            const articles = [
                { id: 1, title: "The Hidden Benefits of Adequate Sleep", summary: "Discover how optimizing your sleep cycle can boost immunity and mental clarity.", icon: 'moon', color: 'bg-indigo-100 text-indigo-600' },
                { id: 2, title: "Debunking 5 Common Diet Myths", summary: "Expert nutrition advice to help you cut through the noise and achieve your health goals.", icon: 'salad', color: 'bg-green-100 text-green-600' },
                { id: 3, title: "Understanding and Managing Chronic Stress", summary: "Practical techniques and lifestyle changes to mitigate the long-term effects of stress.", icon: 'heart-handshake', color: 'bg-red-100 text-red-600' },
                { id: 4, title: "Why Hydration is Your Key to Better Health", summary: "Simple guide to calculating your ideal water intake and the signs of dehydration.", icon: 'droplets', color: 'bg-blue-100 text-blue-600' },
                { id: 5, title: "Winter Care: Boosting Your Immunity Naturally", summary: "Tips on vitamins, exercise, and diet to stay healthy during the colder months.", icon: 'snowflake', color: 'bg-cyan-100 text-cyan-600' },
                { id: 6, title: "The Beginner's Guide to Mindfulness", summary: "Learn simple meditation practices to improve focus and reduce anxiety.", icon: 'zap', color: 'bg-yellow-100 text-yellow-600' },
            ];

            const articleCards = articles.map(article => `
                <div class="bg-white rounded-xl p-6 card-shadow flex flex-col space-y-3">
                    <div class="flex items-center space-x-3">
                        <span class="p-3 rounded-full ${article.color}">
                            <i data-lucide="${article.icon}" class="w-5 h-5"></i>
                        </span>
                        <h3 class="text-lg font-semibold text-gray-900">${article.title}</h3>
                    </div>
                    <p class="text-gray-600 text-sm">${article.summary}</p>
                    <a href="#" class="text-primary text-sm font-medium hover:underline flex items-center mt-2" onclick="showMessage('Article loaded: ${article.title}', 'info'); return false;">
                        Read More 
                        <i data-lucide="arrow-right" class="w-4 h-4 ml-1"></i>
                    </a>
                </div>
            `).join('');

            return `
                <header class="text-center mb-10 mt-10">
                    <h1 class="text-3xl font-normal text-gray-800 mb-2">Health Feed</h1>
                    <p class="text-lg text-gray-500">Curated articles and tips for a healthier lifestyle.</p>
                </header>

                <section class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    ${articleCards}
                </section>
            `;
        }
        
        function renderMySchedule() {
            const appointments = [
                { id: 1, date: '2025-11-15', time: '10:00 AM', doctor: 'Dr. Sandeep Srivastava (Cardiologist)', status: 'Confirmed', color: 'bg-success' },
                { id: 2, date: '2025-11-20', time: '02:30 PM', doctor: 'Dr. Z.S. Rana (Orthopedic Surgeon)', status: 'Pending', color: 'bg-yellow-500' },
                { id: 3, date: '2025-12-01', time: '09:00 AM', doctor: 'Dr. R.K. Sodani (Neurologist)', status: 'Cancelled', color: 'bg-red-500' },
            ];

            const scheduleRows = appointments.map(app => `
                <tr class="border-b hover:bg-gray-50 transition duration-100">
                    <td class="p-4 flex items-center">
                        <i data-lucide="calendar" class="w-5 h-5 mr-3 text-primary"></i>
                        ${app.date}
                    </td>
                    <td class="p-4 font-medium">${app.time}</td>
                    <td class="p-4 text-gray-700">${app.doctor}</td>
                    <td class="p-4">
                        <span class="px-3 py-1 text-xs font-semibold rounded-full text-white ${app.color}">${app.status}</span>
                    </td>
                    <td class="p-4 text-right">
                        <button class="text-primary hover:text-blue-700 font-medium text-sm" onclick="showMessage('Appointment ${app.status === 'Confirmed' ? 'details loaded' : 'cannot be modified'}', 'info'); return false;">
                            ${app.status === 'Confirmed' ? 'Details' : 'Reschedule'}
                        </button>
                    </td>
                </tr>
            `).join('');

            return `
                <header class="text-center mb-10 mt-10">
                    <h1 class="text-3xl font-normal text-gray-800 mb-2">My Schedule</h1>
                    <p class="text-lg text-gray-500">View and manage your upcoming and past appointments.</p>
                </header>

                <div class="max-w-4xl mx-auto bg-white rounded-xl card-shadow overflow-hidden">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Doctor</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${scheduleRows}
                        </tbody>
                    </table>
                </div>

                <div class="max-w-4xl mx-auto mt-6 p-4 bg-primary-light rounded-xl flex items-center justify-between card-shadow">
                    <p class="text-primary font-medium flex items-center">
                        <i data-lucide="plus-circle" class="w-5 h-5 mr-2"></i>
                        Need a new appointment?
                    </p>
                    <button onclick="setView('doctors')" class="bg-primary text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-800 transition">
                        Book Now
                    </button>
                </div>
            `;
        }

        function renderDashboard() {
            if (currentRole === 'doctor') {
                return renderDoctorDashboard();
            }
            return renderPatientDashboard();
        }

        function renderPatientDashboard() {
            const stats = [
                { title: "Total Appointments", value: 12, icon: 'calendar-check', color: 'text-success', bg: 'bg-green-100' },
                { title: "Favorite Doctors", value: 3, icon: 'heart', color: 'text-red-600', bg: 'bg-red-100' },
                { title: "Last Check-up", value: '09/10/2025', icon: 'clock', color: 'text-primary', bg: 'bg-blue-100' },
                { title: "Health Articles Read", value: 45, icon: 'book-open', color: 'text-yellow-600', bg: 'bg-yellow-100' },
            ];

            const statCards = stats.map(stat => `
                <div class="bg-white rounded-xl p-6 card-shadow flex items-center space-x-4">
                    <div class="p-3 rounded-full ${stat.bg} ${stat.color}">
                        <i data-lucide="${stat.icon}" class="w-6 h-6"></i>
                    </div>
                    <div>
                        <p class="text-2xl font-bold text-gray-900">${stat.value}</p>
                        <p class="text-sm text-gray-500">${stat.title}</p>
                    </div>
                </div>
            `).join('');

            return `
                <header class="text-center mb-10 mt-10">
                    <h1 class="text-3xl font-normal text-gray-800 mb-2">Welcome Back, ${currentUserName}</h1>
                    <p class="text-lg text-gray-500">Your health overview at a glance.</p>
                    <button onclick="simulateRoleChange()" class="mt-4 text-sm text-primary hover:underline font-medium">
                        (Simulate Switch to Doctor Role)
                    </button>
                </header>

                <section class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                    ${statCards}
                </section>

                <section class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <!-- Recent Activity -->
                    <div class="lg:col-span-2 bg-white rounded-xl p-6 card-shadow">
                        <h2 class="text-xl font-semibold text-gray-800 mb-4">Recent Activity</h2>
                        <ul class="space-y-4 text-sm">
                            <li class="flex items-center justify-between border-b pb-2">
                                <span class="flex items-center text-gray-600"><i data-lucide="check-circle" class="w-4 h-4 mr-2 text-success"></i>Appointment with Dr. Srivastava confirmed.</span>
                                <span class="text-gray-400">2 hours ago</span>
                            </li>
                            <li class="flex items-center justify-between border-b pb-2">
                                <span class="flex items-center text-gray-600"><i data-lucide="brain" class="w-4 h-4 mr-2 text-primary"></i>Used Symptom Checker for fatigue.</span>
                                <span class="text-gray-400">Yesterday</span>
                            </li>
                            <li class="flex items-center justify-between pb-2">
                                <span class="flex items-center text-gray-600"><i data-lucide="heart" class="w-4 h-4 mr-2 text-red-500"></i>Added Dr. Abha Jain to favorites.</span>
                                <span class="text-gray-400">3 days ago</span>
                            </li>
                        </ul>
                    </div>

                    <!-- Next Appointment Summary -->
                    <div class="bg-white rounded-xl p-6 card-shadow border-l-4 border-success">
                        <h2 class="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                            <i data-lucide="calendar-check" class="w-5 h-5 mr-2 text-success"></i>
                            Next Appointment
                        </h2>
                        <p class="text-3xl font-bold text-gray-900 mb-2">10:00 AM</p>
                        <p class="text-lg text-gray-700 mb-4">Friday, November 15, 2025</p>
                        <p class="text-sm text-gray-600">
                            Dr. Sandeep Srivastava 
                            <span class="block text-xs text-gray-500">Cardiologist, Indore</span>
                        </p>
                        <button onclick="setView('my-schedule')" class="mt-4 w-full bg-success text-white text-sm px-4 py-2 rounded-lg hover:bg-green-700 transition">
                            View Details
                        </button>
                    </div>
                </section>
            `;
        }
        
        function renderDoctorDashboard() {
            const stats = [
                { title: "Today's Consults", value: doctorAppointments.filter(a => a.status === 'Confirmed').length, icon: 'user-check', color: 'text-success', bg: 'bg-green-100' },
                { title: "Total Patients", value: '458', icon: 'users', color: 'text-primary', bg: 'bg-blue-100' },
                { title: "Avg. Rating", value: '4.8/5.0', icon: 'star', color: 'text-yellow-600', bg: 'bg-yellow-100' },
                { title: "Consultation Hours", value: '150 hrs', icon: 'briefcase', color: 'text-indigo-600', bg: 'bg-indigo-100' },
            ];

            const statCards = stats.map(stat => `
                <div class="bg-white rounded-xl p-6 card-shadow flex items-center space-x-4">
                    <div class="p-3 rounded-full ${stat.bg} ${stat.color}">
                        <i data-lucide="${stat.icon}" class="w-6 h-6"></i>
                    </div>
                    <div>
                        <p class="text-2xl font-bold text-gray-900">${stat.value}</p>
                        <p class="text-sm text-gray-500">${stat.title}</p>
                    </div>
                </div>
            `).join('');
            
            const scheduleRows = doctorAppointments.map(app => `
                <li class="flex items-center justify-between p-4 border-b last:border-b-0 ${app.status === 'Canceled' ? 'bg-red-50' : 'hover:bg-gray-50'} transition">
                    <div class="flex items-center space-x-3">
                        <i data-lucide="${app.isVideo ? 'video' : 'person-standing'}" class="w-5 h-5 ${app.isVideo ? 'text-primary' : 'text-success'}"></i>
                        <div>
                            <p class="font-medium text-gray-800">${app.patient} - ${app.time}</p>
                            <p class="text-xs text-gray-500">${app.reason}</p>
                        </div>
                    </div>
                    <div class="flex items-center space-x-3">
                        <span class="px-2 py-0.5 text-xs font-semibold rounded-full ${app.status === 'Confirmed' ? 'bg-success text-white' : app.status === 'Canceled' ? 'bg-red-500 text-white' : 'bg-yellow-500 text-white'}">
                            ${app.status}
                        </span>
                        <button class="text-primary hover:text-blue-700 p-1 rounded-full ${app.status === 'Confirmed' ? '' : 'opacity-50 cursor-not-allowed'}" 
                                onclick="showMessage('${app.status === 'Confirmed' ? 'Starting consultation with ' + app.patient : 'Appointment is ' + app.status}', 'info');"
                                ${app.status !== 'Confirmed' ? 'disabled' : ''}>
                            <i data-lucide="external-link" class="w-4 h-4"></i>
                        </button>
                    </div>
                </li>
            `).join('');


            return `
                <header class="text-center mb-10 mt-10">
                    <h1 class="text-3xl font-normal text-gray-800 mb-2">Welcome to your Portal, ${currentUserName}</h1>
                    <p class="text-lg text-gray-500">Your practice statistics and daily schedule.</p>
                    <button onclick="simulateRoleChange()" class="mt-4 text-sm text-primary hover:underline font-medium">
                        (Simulate Switch to Patient Role)
                    </button>
                </header>

                <section class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                    ${statCards}
                </section>
                
                <section class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <!-- Today's Schedule -->
                    <div class="lg:col-span-2 bg-white rounded-xl p-6 card-shadow">
                        <h2 class="text-xl font-semibold text-gray-800 mb-4 flex items-center justify-between">
                            <span><i data-lucide="clipboard-check" class="w-5 h-5 mr-2 inline-block text-success"></i> Today's Schedule (Oct 3)</span>
                            <span class="text-sm font-normal text-gray-500">${doctorAppointments.filter(a => a.status === 'Confirmed').length} Confirmed</span>
                        </h2>
                        <ul class="divide-y divide-gray-200">
                            ${scheduleRows}
                        </ul>
                    </div>
                    
                    <!-- Quick Actions & Stats -->
                    <div class="space-y-6">
                        <!-- Action Center -->
                        <div class="bg-primary-light rounded-xl p-6 card-shadow">
                            <h2 class="text-xl font-semibold text-primary mb-4 flex items-center">
                                <i data-lucide="zap" class="w-5 h-5 mr-2"></i>
                                Action Center
                            </h2>
                            <button onclick="showMessage('Availability updated for the week.', 'success')" class="w-full py-2.5 mb-3 bg-primary text-white rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center">
                                <i data-lucide="clock" class="w-4 h-4 mr-2"></i> Update Availability
                            </button>
                            <button onclick="showMessage('Patient queue page loaded.', 'info')" class="w-full py-2.5 bg-success text-white rounded-lg hover:bg-green-700 transition font-medium flex items-center justify-center">
                                <i data-lucide="users" class="w-4 h-4 mr-2"></i> View Patient Queue
                            </button>
                        </div>

                        <!-- Messages Summary -->
                        <div class="bg-white rounded-xl p-6 card-shadow">
                            <h2 class="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                                <i data-lucide="message-square" class="w-5 h-5 mr-2 text-primary"></i>
                                Messages
                            </h2>
                            <div class="space-y-3 text-sm">
                                <div class="flex justify-between">
                                    <span class="text-gray-600">Unread Patient Messages:</span>
                                    <span class="font-bold text-red-500">4</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-600">New Follow-up Requests:</span>
                                    <span class="font-bold text-orange-500">2</span>
                                </div>
                                <button onclick="showMessage('Loading messaging inbox...', 'info')" class="mt-3 w-full text-primary hover:text-blue-700 text-sm font-medium">Go to Inbox</button>
                            </div>
                        </div>
                    </div>
                </section>
            `;
        }

        function renderProfileView() {
            const userInitial = currentUserName ? currentUserName.substring(0, 2).toUpperCase() : (currentUserId ? currentUserId.substring(0, 2).toUpperCase() : 'AJ');
            const userName = currentUserName;
            const roleTag = currentRole === 'doctor' ? 'Medical Practitioner' : 'Patient Profile';
            const roleColor = currentRole === 'doctor' ? 'bg-success' : 'bg-teal-600';

            return `
                <div class="max-w-4xl mx-auto mt-6 bg-white rounded-xl shadow-2xl overflow-hidden">
                    <!-- Header Section (Banner/Cover Image) -->
                    <div class="h-32 bg-teal-600 relative">
                        <div class="absolute inset-0 bg-gradient-to-r from-blue-500 to-teal-600 opacity-90"></div>
                    </div>

                    <!-- Profile Content -->
                    <div class="px-6 pb-8">
                        <!-- Avatar Section -->
                        <div class="flex flex-col items-center sm:items-start -mt-16">
                            <div class="w-28 h-28 object-cover rounded-full border-4 border-white shadow-lg bg-blue-100 text-primary flex items-center justify-center text-4xl font-bold">
                                ${userInitial}
                            </div>
                            
                            <div class="text-center sm:text-left mt-4">
                                <h1 class="text-3xl font-extrabold text-gray-900">${userName}</h1>
                                <p class="text-lg text-teal-600 font-medium mt-1">${roleTag}</p>
                                <span class="inline-block mt-2 px-3 py-1 text-sm font-semibold text-white ${roleColor} rounded-full flex items-center">
                                    <i data-lucide="shield-check" class="w-4 h-4 mr-1"></i>
                                    ${currentRole === 'doctor' ? 'Specialist (Neurology)' : 'Verified Account'}
                                </span>
                            </div>
                        </div>

                        <!-- Personal Information Section -->
                        <div class="mt-8 pt-6 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div>
                                <h2 class="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                                    <i data-lucide="info" class="w-5 h-5 mr-2 text-primary"></i>
                                    Contact Details
                                </h2>
                                <dl class="space-y-3 text-gray-700">
                                    <div class="flex">
                                        <dt class="w-28 font-medium text-gray-500">Email:</dt>
                                        <dd class="flex-1">${currentRole === 'doctor' ? 'dr.jane.foster@clinic.com' : 'user_email@example.com'}</dd>
                                    </div>
                                    <div class="flex">
                                        <dt class="w-28 font-medium text-gray-500">Phone:</dt>
                                        <dd class="flex-1">(+91) 999-000-1111</dd>
                                    </div>
                                    <div class="flex">
                                        <dt class="w-28 font-medium text-gray-500">Location:</dt>
                                        <dd class="flex-1">Indore, India</dd>
                                    </div>
                                    ${currentRole !== 'doctor' ? `
                                        <div class="flex">
                                            <dt class="w-28 font-medium text-gray-500">Birthday:</dt>
                                            <dd class="flex-1">15 Jan 1990</dd>
                                        </div>
                                    ` : `
                                        <div class="flex">
                                            <dt class="w-28 font-medium text-gray-500">License ID:</dt>
                                            <dd class="flex-1">IND-90210-MD</dd>
                                        </div>
                                    `}
                                </dl>
                            </div>

                            <!-- Health/Professional Summary Section -->
                            <div>
                                <h2 class="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                                    <i data-lucide="clipboard-list" class="w-5 h-5 mr-2 text-primary"></i>
                                    ${currentRole === 'doctor' ? 'Professional Summary' : 'Medical Summary'}
                                </h2>
                                <dl class="space-y-3 text-gray-700">
                                    ${currentRole === 'doctor' ? `
                                        <div class="flex">
                                            <dt class="w-28 font-medium text-gray-500">Specialty:</dt>
                                            <dd class="flex-1 font-bold text-primary">Neurology</dd>
                                        </div>
                                        <div class="flex">
                                            <dt class="w-28 font-medium text-gray-500">Experience:</dt>
                                            <dd class="flex-1">12 Years</dd>
                                        </div>
                                        <div class="flex">
                                            <dt class="w-28 font-medium text-gray-500">Hospital:</dt>
                                            <dd class="flex-1">Care Connect Multi-Specialty</dd>
                                        </div>
                                    ` : `
                                        <div class="flex">
                                            <dt class="w-28 font-medium text-gray-500">Blood Type:</dt>
                                            <dd class="flex-1 font-bold text-red-600">O+</dd>
                                        </div>
                                        <div class="flex">
                                            <dt class="w-28 font-medium text-gray-500">Allergies:</dt>
                                            <dd class="flex-1">Pollen, Penicillin (Simulated)</dd>
                                        </div>
                                        <div class="flex">
                                            <dt class="w-28 font-medium text-gray-500">Conditions:</dt>
                                            <dd class="flex-1">Mild Asthma (Simulated)</dd>
                                        </div>
                                    `}
                                    <div class="flex">
                                        <dt class="w-28 font-medium text-gray-500">Primary Care:</dt>
                                        <dd class="flex-1">Dr. S. Sharma</dd>
                                    </div>
                                </dl>
                                <button class="mt-4 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition" onclick="showMessage('${currentRole === 'doctor' ? 'Opening profile editor...' : 'Opening medical history editor...'}', 'info');">
                                    Edit ${currentRole === 'doctor' ? 'Professional Info' : 'Health Record'}
                                </button>
                            </div>
                        </div>

                        <!-- Settings and Actions -->
                        <div class="mt-8 pt-6 border-t border-gray-100">
                            <h2 class="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                                <i data-lucide="settings" class="w-5 h-5 mr-2 text-primary"></i>
                                Account Settings
                            </h2>
                            <div class="space-y-4">
                                <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition duration-150 cursor-pointer" onclick="showMessage('Password change initiated...', 'info');">
                                    <span class="font-medium text-gray-800">Change Password</span>
                                    <i data-lucide="chevron-right" class="w-5 h-5 text-gray-500"></i>
                                </div>
                                <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition duration-150 cursor-pointer" onclick="showMessage('Notifications settings loaded...', 'info');">
                                    <span class="font-medium text-gray-800">Notification Preferences</span>
                                    <i data-lucide="chevron-right" class="w-5 h-5 text-gray-500"></i>
                                </div>
                                <button onclick="handleLogout(event)" class="w-full py-3 bg-red-100 text-red-600 font-bold rounded-lg hover:bg-red-200 transition">
                                    <i data-lucide="log-out" class="w-5 h-5 inline-block mr-2"></i>
                                    Sign Out of CareConnect
                                </button>
                            </div>
                        </div>

                    </div>
                </div>
            `;
        }

        // --- Data and Logic Handlers (Doctor View) ---

        function filterDoctors() {
            const specialtyFilter = document.getElementById('specialty-filter');
            if (specialtyFilter) {
                currentFilters.specialty = specialtyFilter.value;
            }
            
            let filteredList = allDoctors;

            if (currentFilters.specialty !== 'All Specializations') {
                filteredList = filteredList.filter(doctor => 
                    doctor.specialties.some(s => s.toLowerCase().includes(currentFilters.specialty.toLowerCase()))
                );
            }
            
            renderDoctorCards(filteredList);
        }

        function renderDoctorCards(doctorsList) {
            const doctorGrid = document.getElementById('doctor-grid');
            if (!doctorGrid) return; 
            
            doctorGrid.innerHTML = ''; 

            if (doctorsList.length === 0) {
                doctorGrid.innerHTML = '<p class="text-center text-xl text-gray-500 col-span-full py-10">No doctors match your criteria.</p>';
                return;
            }

            doctorsList.forEach((doctor) => {
                const card = document.createElement('div');
                card.className = 'bg-white rounded-xl p-4 card-shadow flex flex-col';

                const specialtiesHtml = doctor.specialties.map(spec =>
                    `<span class="text-xs font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">${spec}</span>`
                ).join('');

                card.innerHTML = `
                    <div class="flex items-start space-x-3 mb-4">
                        <img src="${doctor.image}" alt="Dr. ${doctor.name}" onerror="this.onerror=null; this.src='https://placehold.co/40x40/F0F8FF/1e40af?text=DR';"
                             class="w-10 h-10 rounded-full object-cover flex-shrink-0">
                        <div class="flex-grow">
                            <h3 class="text-base font-semibold text-gray-900">${doctor.name}</h3>
                            <div class="flex flex-wrap gap-1 mt-1">
                                ${specialtiesHtml}
                            </div>
                        </div>
                    </div>

                    <div class="text-sm text-gray-600 space-y-2 mb-4 pl-12">
                        <p class="flex items-center">
                            <i data-lucide="map-pin" class="w-4 h-4 mr-2 text-gray-400"></i>
                            ${doctor.location}
                        </p>
                        <p class="flex items-center">
                            <i data-lucide="phone" class="w-4 h-4 mr-2 text-gray-400"></i>
                            ${doctor.phone}
                        </p>
                    </div>

                    <div class="ai-video-toggle relative mb-4 cursor-pointer p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition duration-150 mx-4">
                        <div class="flex justify-between items-center text-sm font-medium text-gray-700">
                            <span class="flex items-center">
                                <i data-lucide="bot" class="w-4 h-4 mr-2 text-primary"></i>
                                AI Video Introduction
                            </span>
                            <i data-lucide="chevron-down" class="w-4 h-4 text-gray-500 toggle-icon"></i>
                        </div>
                        <div class="video-content hidden mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600">
                            Simulated AI Video Transcript for Dr. ${doctor.name}: "Hello, I specialize in ${doctor.specialties[0]}. I look forward to connecting with you for your healthcare needs!"
                        </div>
                    </div>

                    <button data-doctor-id="${doctor.id}" class="book-appointment-btn w-full bg-success text-white py-2.5 rounded-lg font-medium text-base hover:bg-green-700 transition duration-150 shadow-md mx-4 mb-4">
                        Book Appointment
                    </button>
                `;
                // Apply dynamic styles for single-file aesthetic consistency
                const button = card.querySelector('.book-appointment-btn');
                const toggle = card.querySelector('.ai-video-toggle');
                if (button) button.style.width = 'calc(100% - 2rem)';
                if (toggle) toggle.style.width = 'calc(100% - 2rem)';
                
                doctorGrid.appendChild(card);
            });
            lucide.createIcons();
            addEventListeners();
        }

        // --- Symptom Checker LLM Handler ---

        window.handleSymptomSubmit = async function(e) {
            e.preventDefault();
            const symptomsText = document.getElementById('symptoms-input').value.trim();
            const resultsCard = document.getElementById('ai-results-card');
            const responseContent = document.getElementById('ai-response-content');
            const sourcesDiv = document.getElementById('ai-response-sources');
            const submitBtn = document.getElementById('symptom-submit-btn');

            if (!symptomsText) return;

            // 1. UI Feedback: Loading State
            resultsCard.classList.remove('hidden');
            responseContent.innerHTML = `<div class="flex items-center justify-center py-8 text-primary font-medium">
                <i data-lucide="loader" class="w-6 h-6 mr-3 animate-spin"></i> Analyzing symptoms...
            </div>`;
            submitBtn.disabled = true;
            submitBtn.classList.add('opacity-50');
            lucide.createIcons();

            try {
                // 2. Configure LLM API Call
                const systemPrompt = "Act as a compassionate and professional AI medical assistant. Do NOT provide a definitive diagnosis or medical advice. Instead, analyze the user's symptoms and provide a list of 3-5 possible (non-urgent) conditions that match the symptoms, followed by a strong recommendation to see a qualified doctor. The tone must be reassuring and informative. Format the output using markdown for readability.";
                const userQuery = `My symptoms are: ${symptomsText}`;
                
                const payload = {
                    contents: [{ parts: [{ text: userQuery }] }],
                    tools: [{ "google_search": {} }], // Use grounding for health info
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                };

                const response = await fetchWithRetry(GEMINI_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();
                const candidate = result.candidates?.[0];

                if (candidate && candidate.content?.parts?.[0]?.text) {
                    const text = candidate.content.parts[0].text;
                    let sources = [];
                    const groundingMetadata = candidate.groundingMetadata;
                    if (groundingMetadata && groundingMetadata.groundingAttributions) {
                        sources = groundingMetadata.groundingAttributions
                            .map(attribution => ({
                                uri: attribution.web?.uri,
                                title: attribution.web?.title,
                            }))
                            .filter(source => source.uri && source.title);
                    }

                    // 3. Render Results
                    responseContent.innerHTML = text.replace(/\n/g, '<br>'); // Simple newline formatting

                    if (sources.length > 0) {
                        const sourceHtml = sources.map((s, i) => 
                            `<a href="${s.uri}" target="_blank" class="text-xs text-primary hover:underline">${s.title}</a>${i < sources.length - 1 ? ' | ' : ''}`
                        ).join('');
                        sourcesDiv.innerHTML = `Information grounded in: ${sourceHtml}`;
                    } else {
                        sourcesDiv.innerHTML = 'Information generated without external sources.';
                    }
                    showMessage('Symptom analysis complete!', 'success');
                } else {
                    responseContent.innerHTML = `<p class="text-red-500">Sorry, the AI assistant could not generate a report. Please try again or rephrase your symptoms.</p>`;
                    sourcesDiv.innerHTML = '';
                    showMessage('Analysis failed.', 'error');
                }
            } catch (error) {
                console.error("Gemini API Error:", error);
                responseContent.innerHTML = `<p class="text-red-500">An error occurred while connecting to the AI service. Please check the console for details.</p>`;
                sourcesDiv.innerHTML = '';
                showMessage('AI connection error.', 'error');
            } finally {
                // 4. UI Feedback: Reset State
                submitBtn.disabled = false;
                submitBtn.classList.remove('opacity-50');
            }
        }


        // --- Event Listener Setup and Handlers ---
        function addEventListeners() {
            // Doctors View Listeners
            const specialtyFilter = document.getElementById('specialty-filter');
            const nearMeButton = document.getElementById('near-me-button');
            const doctorGrid = document.getElementById('doctor-grid');

            if (specialtyFilter) {
                specialtyFilter.removeEventListener('change', filterDoctors);
                specialtyFilter.addEventListener('change', filterDoctors);
            }

            if (nearMeButton) {
                nearMeButton.removeEventListener('click', handleNearMeClick);
                nearMeButton.addEventListener('click', handleNearMeClick);
            }

            if (doctorGrid) {
                doctorGrid.querySelectorAll('.book-appointment-btn').forEach(button => {
                    button.removeEventListener('click', handleBookAppointment);
                    button.addEventListener('click', handleBookAppointment);
                });

                doctorGrid.querySelectorAll('.ai-video-toggle').forEach(toggle => {
                    toggle.removeEventListener('click', handleVideoToggle);
                    toggle.addEventListener('click', handleVideoToggle);
                });
            }
        }

        function handleNearMeClick() {
            showMessage('Finding doctors near your current location (Indore)...', 'info');
            filterDoctors();
        }

        function handleBookAppointment(event) {
            const doctorId = parseInt(event.currentTarget.dataset.doctorId);
            const doc = allDoctors.find(d => d.id === doctorId);
            if (doc) {
                showMessage(`Appointment request sent for Dr. ${doc.name}! (Simulated)`, 'success');
                setView('my-schedule');
            }
        }

        function handleVideoToggle(event) {
            const toggleElement = event.currentTarget;
            const content = toggleElement.querySelector('.video-content');
            const icon = toggleElement.querySelector('.toggle-icon');

            if (content.classList.contains('hidden')) {
                content.classList.remove('hidden');
                icon.setAttribute('data-lucide', 'chevron-up');
            } else {
                content.classList.add('hidden');
                icon.setAttribute('data-lucide', 'chevron-down');
            }
            lucide.createIcons();
        }
        
        // --- Authentication Modal and Form Handlers (Existing Flask Integration) ---

        window.closeModal = function() { authModal.classList.add('hidden'); }
        window.openModal = function(tab = 'signin') { authModal.classList.remove('hidden'); switchAuthTab(tab); }
        
        window.switchAuthTab = function(tab) {
            // Logic to switch between Sign In and Sign Up forms
             if (tab === 'signin') {
                formSignIn.classList.remove('hidden');
                formSignUp.classList.add('hidden');
                tabSignIn.classList.remove('text-gray-500', 'border-gray-200');
                tabSignIn.classList.add('text-primary', 'border-primary');
                tabSignUp.classList.remove('text-primary', 'border-primary');
                tabSignUp.classList.add('text-gray-500', 'border-gray-200');
            } else if (tab === 'signup') {
                formSignUp.classList.remove('hidden');
                formSignIn.classList.add('hidden');
                tabSignUp.classList.remove('text-gray-500', 'border-gray-200');
                tabSignUp.classList.add('text-primary', 'border-primary');
                tabSignIn.classList.remove('text-primary', 'border-primary');
                tabSignIn.classList.add('text-gray-500', 'border-gray-200');
            }
        }
        
        // Flask integration for Sign In (simulated with Firebase Anonymous Auth fallback)
        window.handleSignInSubmit = async function(e) {
            e.preventDefault();
            const email = document.getElementById('signin-email').value;
            closeModal();
            showMessage(`Attempting sign in for ${email}...`, 'info');

            if (auth) {
                try {
                    await signInAnonymously(auth); // Simulated auth success
                    // Simulate role assignment based on email for persistence
                    if (email.toLowerCase().includes('doctor')) {
                        currentRole = 'doctor';
                        currentUserName = 'Dr. Jane Foster';
                    } else {
                        currentRole = 'patient';
                        currentUserName = 'Alex J. Rivera';
                    }
                    showMessage(`Welcome back! You are now signed in as a ${currentRole}.`, 'success');
                } catch (error) {
                    console.error("Sign-in simulation failed:", error);
                    showMessage("Login failed.", "error");
                }
            } else {
                 currentRole = email.toLowerCase().includes('doctor') ? 'doctor' : 'patient';
                 currentUserName = currentRole === 'doctor' ? 'Dr. Jane Foster' : 'Alex J. Rivera';
                 showMessage("Login simulated. Firebase not initialized.", "info");
                 updateAuthUI({ uid: 'mock_user' });
            }
        }

        // Flask integration for Sign Up
        window.handleSignUpSubmit = async function(e) {
            e.preventDefault();
            const name = document.getElementById('signup-name').value;
            const email = document.getElementById('signup-email').value;
            const password = document.getElementById('signup-password').value;

            closeModal();
            showMessage(`Registering account for ${email}...`, 'info');

            try {
                const response = await fetchWithRetry(`${BASE_URL}/signup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, password })
                });

                const result = await response.json();

                if (response.ok) {
                    showMessage(result.message, 'success');
                    if (auth) await signInAnonymously(auth); 
                } else {
                    showMessage(`Registration failed: ${result.message}`, 'error');
                }
            } catch (error) {
                console.error("Fetch error during signup:", error);
                showMessage("Connection error. Is the Flask server running?", 'error');
            }
        }
        
        // Doctor Registration Modals and Flask integration
        window.openDoctorRegistrationModal = function() { doctorRegistrationModal.classList.remove('hidden'); }
        window.closeDoctorRegistrationModal = function() { doctorRegistrationModal.classList.add('hidden'); }

        window.handleDoctorRegistrationSubmit = async function(e) {
            e.preventDefault();
            const form = e.target;
            const data = {
                name: form.elements['doc-reg-name'].value,
                email: form.elements['doc-reg-email'].value,
                specialty: form.elements['doc-reg-specialty'].value,
                location: form.elements['doc-reg-location'].value,
                phone: form.elements['doc-reg-phone'].value,
                bio: form.elements['doc-reg-bio'].value
            };

            closeDoctorRegistrationModal();
            showMessage(`Submitting registration for Dr. ${data.name.split(' ').pop()}...`, 'info');

            try {
                const response = await fetchWithRetry(`${BASE_URL}/doctor/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (response.ok) {
                    showMessage(result.message, 'success');
                    form.reset();
                } else {
                    showMessage(`Registration failed: ${result.message}`, 'error');
                }
            } catch (error) {
                console.error("Fetch error during doctor registration:", error);
                showMessage("Connection error. Is the Flask server running?", 'error');
            }
        }

        // --- Authentication State Management (Firebase) ---

        function handleLogout(e) {
             e.preventDefault();
             if (auth) {
                document.getElementById('logout-link')?.removeEventListener('click', handleLogout);
                signOut(auth).then(() => {
                    currentRole = 'patient';
                    currentUserName = 'Guest';
                    showMessage("Logged out successfully.", "info");
                    setView('doctors'); // Redirect to home/doctors page after logout
                }).catch(error => {
                    console.error("Logout failed:", error);
                    showMessage("Logout failed. See console.", "error");
                });
            } else {
                currentRole = 'patient';
                currentUserName = 'Guest';
                showMessage("Logout simulated.", "info");
                updateAuthUI(null);
                setView('doctors');
            }
        }

        function updateAuthUI(user) {
            if (!authControls) return;
            authControls.innerHTML = '';
            
            if (user) {
                currentUserId = user.uid;
                const userInitial = currentUserName ? currentUserName.substring(0, 2).toUpperCase() : (currentUserId ? currentUserId.substring(0, 2).toUpperCase() : 'E+'); 
                const tag = currentRole === 'doctor' ? 'Doc' : 'Profile';

                authControls.innerHTML = `
                    <!-- New link to profile page -->
                    <span class="text-gray-600 hover:text-primary transition duration-150 text-sm font-medium">
                        Welcome, ${currentUserName.split(' ')[0]}
                    </span>
                    <a href="#" onclick="setView('profile'); return false;" class="text-gray-600 hover:text-primary transition duration-150 text-sm flex items-center">
                        <i data-lucide="user-plus" class="w-4 h-4 mr-1"></i>
                        ${tag}
                    </a>
                    <a href="#" onclick="setView('profile'); return false;">
                        <div class="w-8 h-8 rounded-full bg-blue-100 text-primary flex items-center justify-center font-semibold text-sm">
                            ${userInitial}
                        </div>
                    </a>
                    <a href="#" id="logout-link" class="text-gray-600 hover:text-primary text-sm transition duration-150">Logout</a>
                `;
                 document.getElementById('logout-link')?.addEventListener('click', handleLogout);
            } else {
                 currentUserId = null;
                 currentRole = 'patient'; // Reset role on mock logout/unauthenticated
                 currentUserName = 'Guest';
                 authControls.innerHTML = `
                    <a href="#" class="text-primary font-medium hover:underline text-sm transition duration-150" id="signup-link">Sign Up</a>
                    <a href="#" id="login-link" class="text-primary font-medium hover:underline text-sm transition duration-150">Login</a>
                `;
                 document.getElementById('login-link')?.addEventListener('click', (e) => { e.preventDefault(); openModal('signin'); });
                 document.getElementById('signup-link')?.addEventListener('click', (e) => { e.preventDefault(); openModal('signup'); });
            }
            lucide.createIcons();
        }

        // --- Initialization ---
        window.onload = function () {
            // Firebase Initialization
            if (firebaseConfig) {
                app = initializeApp(firebaseConfig);
                auth = getAuth(app);
                db = getFirestore(app);
                
                onAuthStateChanged(auth, async (user) => {
                    // Note: In a real app, role would be fetched from Firestore/DB here.
                    // For mock, we only update UI based on authenticated status.
                    updateAuthUI(user); 
                    
                    if (!user && initialAuthToken) {
                        try {
                            await signInWithCustomToken(auth, initialAuthToken);
                        } catch (error) {
                            console.error("Error signing in with custom token:", error);
                            await signInAnonymously(auth);
                        }
                    } else if (!user) {
                         await signInAnonymously(auth).catch(error => {
                            console.error("Anonymous sign-in failed:", error);
                         });
                    }
                    
                    // Render initial view after auth state is determined
                    setView(currentPage);
                });
            } else {
                console.error("Firebase config not available. Running in unauthenticated mock mode.");
                updateAuthUI(null); 
                setView(currentPage);
            }
        }
