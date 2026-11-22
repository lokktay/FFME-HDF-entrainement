// ==========================================================================
// ÉCOLE D'ESCALADE (cours récurrents, élèves, appel) & CYCLES D'ENTRAÎNEMENT
// Chargé après app.js : utilise ses variables et fonctions globales
// (db, currentUser, clubMembers, listeners, escapeHtml, uiIcon, alert, openModal…).
// ==========================================================================

// --- Données en mémoire ---
let schoolCourses = [];
let schoolStudentViews = [];                 // cours où l'utilisateur est élève (vue limitée à ses présences)
let openedCourseId = null;
let openedCourseAttendance = new Map();      // date -> document d'appel du cours ouvert
let showAllCourseDates = false;              // cours ouvert : toutes les dates ou seulement la prochaine
const expandedStudentCourses = new Set();    // vue élève : cours dont toutes les dates sont dépliées
let schoolHolidayCache = new Map();          // zone -> [{ start, end, description }]
let courseEditorState = null;                // état de la fenêtre de création / modification
let attendanceState = null;                  // état de la fenêtre d'appel
let schoolAssignSessionId = null;
const cyclesCache = new Map();               // userId -> [cycles]
let editingCycle = null;                     // { userId, cycleId|null }

const SCHOOL_HOLIDAY_ZONES = ['A', 'B', 'C'];
const SCHOOL_WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const SCHOOL_MAX_SESSIONS = 60;

// --- Dates (toujours au format AAAA-MM-JJ, en heure locale) ---
function schoolIsoDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
function schoolParseDate(iso) {
    const [y, m, d] = String(iso || '').split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
}
function schoolToday() {
    return schoolIsoDate(new Date());
}
function formatSchoolDate(iso, withYear = false) {
    if(!iso) return '';
    return schoolParseDate(iso).toLocaleDateString('fr-FR', {
        weekday: 'short', day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {})
    });
}
function getCourseWeekdayLabel(course) {
    return course && course.startDate ? SCHOOL_WEEKDAYS[schoolParseDate(course.startDate).getDay()] : '';
}
function getCourseScheduleLabel(course) {
    const day = getCourseWeekdayLabel(course);
    const time = course.startTime ? `${course.startTime}${course.endTime ? ' – ' + course.endTime : ''}` : '';
    return `Chaque ${day}${time ? ' · ' + time : ''}`;
}

// --- Droits ---
function isCourseStaff(course, user = currentUser) {
    return Boolean(course && user && Array.isArray(course.staffIds) && course.staffIds.includes(user.id));
}
function canManageSchool() {
    return isClubManager();
}
function canRunCourse(course) {
    return canManageSchool() || isCourseStaff(course);
}
function getMyCourses() {
    return canManageSchool() ? schoolCourses : schoolCourses.filter(course => isCourseStaff(course));
}
function getSchoolStaffCandidates() {
    return clubMembers
        .filter(member => canCreateSessions(member, currentUser.clubId))
        .sort((a, b) => String(a.username || '').localeCompare(String(b.username || ''), 'fr', { sensitivity: 'base' }));
}
function getMemberName(userId) {
    const member = clubMembers.find(user => user.id === userId);
    return member ? member.username : 'Membre';
}
function getStudentName(student) {
    if(student.kind === 'member' && student.userId) {
        const member = clubMembers.find(user => user.id === student.userId);
        if(member) return member.username;
    }
    return student.name || 'Élève';
}

// --- Temps réel ---
function startSchoolListeners(clubId, generation) {
    schoolCourses = [];
    schoolStudentViews = [];
    // Club sans école d'escalade : rien à écouter, l'onglet reste caché
    if(!clubId || !currentUser || originalParentUser || !isSchoolEnabled(clubId)) return;
    // Élève : ses cours (nom, horaire, dates et ses propres présences uniquement)
    listeners.push(db.collection('schoolStudentViews')
        .where('clubId', '==', clubId)
        .where('userId', '==', currentUser.id)
        .onSnapshot(snap => {
            if(generation !== realtimeListenerGeneration || !auth.currentUser) return;
            schoolStudentViews = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
                .sort((a, b) => String(a.courseName || '').localeCompare(String(b.courseName || ''), 'fr', { sensitivity: 'base' }));
            updateSchoolNavVisibility();
            if(document.getElementById('school-space').classList.contains('active')) renderSchool();
        }, error => handleRealtimeListenerError("vos cours de l'école d'escalade", generation, error)));
    let query = null;
    if(isClubManager(currentUser, clubId)) {
        query = db.collection('schoolCourses').where('clubId', '==', clubId);
    } else if(canCreateSessions(currentUser, clubId)) {
        query = db.collection('schoolCourses')
            .where('clubId', '==', clubId)
            .where('staffIds', 'array-contains', currentUser.id);
    }
    if(!query) return;
    listeners.push(query.onSnapshot(snap => {
        if(generation !== realtimeListenerGeneration || !auth.currentUser) return;
        schoolCourses = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fr', { sensitivity: 'base' }));
        updateSchoolNavVisibility();
        if(document.getElementById('school-space').classList.contains('active')) renderSchool();
    }, error => handleRealtimeListenerError("les cours de l'école d'escalade", generation, error)));
}

function updateSchoolNavVisibility() {
    const nav = document.getElementById('nav-school');
    if(!nav || !currentUser) return;
    const visible = !originalParentUser && isSchoolEnabled() &&
        (canManageSchool() || getMyCourses().length > 0 || schoolStudentViews.length > 0);
    nav.style.display = visible ? 'inline-block' : 'none';
    if(!visible && document.getElementById('school-space').classList.contains('active')) {
        switchTab(hasCoachRights() ? 'coach-dashboard' : 'athlete-sessions');
    }
}

// --- Vacances scolaires (calendrier officiel, data.education.gouv.fr) ---
async function fetchSchoolHolidays(zone) {
    zone = SCHOOL_HOLIDAY_ZONES.includes(zone) ? zone : 'B';
    if(schoolHolidayCache.has(zone)) return schoolHolidayCache.get(zone);
    const storageKey = `hdf-holidays-${zone}`;
    try {
        const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
        if(stored && Date.now() - stored.savedAt < 7 * 24 * 3600 * 1000 && Array.isArray(stored.holidays)) {
            schoolHolidayCache.set(zone, stored.holidays);
            return stored.holidays;
        }
    } catch(e) { /* cache illisible : on recharge */ }

    const since = new Date();
    since.setFullYear(since.getFullYear() - 1);
    const params = new URLSearchParams({
        select: 'description,start_date,end_date,population',
        where: `zones="Zone ${zone}" and end_date>="${schoolIsoDate(since)}"`,
        group_by: 'description,start_date,end_date,population',
        order_by: 'start_date',
        limit: '100'
    });
    const response = await fetch(`https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records?${params}`);
    if(!response.ok) throw new Error(`calendrier scolaire indisponible (${response.status})`);
    const data = await response.json();
    // Les dates sont en UTC : on les ramène au jour de Paris. L'été existe en double
    // (élèves / enseignants) : on ignore la ligne des enseignants.
    const toParisDay = value => new Date(value).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
    const seen = new Set();
    const holidays = (data.results || [])
        .filter(item => item.start_date && item.end_date && item.population !== 'Enseignants')
        .map(item => ({ start: toParisDay(item.start_date), end: toParisDay(item.end_date), description: item.description || 'Vacances' }))
        .filter(item => {
            const key = `${item.start}|${item.end}`;
            if(seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    schoolHolidayCache.set(zone, holidays);
    try { localStorage.setItem(storageKey, JSON.stringify({ savedAt: Date.now(), holidays })); } catch(e) {}
    return holidays;
}
// La date de fin du calendrier officiel est le jour de reprise : exclue, sauf pour un pont d'un seul jour
function getHolidayForDate(iso, holidays) {
    return (holidays || []).find(h => iso >= h.start && (iso < h.end || (h.start === h.end && iso === h.start))) || null;
}

// Récurrence hebdomadaire : les dates en vacances ou retirées à la main ne comptent pas,
// le cours se prolonge donc jusqu'à atteindre le nombre de séances demandé.
function computeCourseDates({ startDate, sessionCount, skipHolidays, holidays, excludedDates, extraDates }) {
    const excluded = new Set(excludedDates || []);
    const dates = [];
    const skipped = [];
    if(startDate) {
        const cursor = schoolParseDate(startDate);
        let guard = 0;
        while(dates.length < sessionCount && guard < 260) {
            const iso = schoolIsoDate(cursor);
            const holiday = skipHolidays ? getHolidayForDate(iso, holidays) : null;
            if(holiday) skipped.push({ date: iso, reason: holiday.description });
            else if(excluded.has(iso)) skipped.push({ date: iso, reason: 'Retirée' });
            else dates.push(iso);
            cursor.setDate(cursor.getDate() + 7);
            guard++;
        }
    }
    const all = [...new Set([...dates, ...(extraDates || [])])].sort();
    return { dates: all, skipped };
}

// ==========================================================================
// ONGLET ÉCOLE
// ==========================================================================
function renderSchool() {
    const list = document.getElementById('school-courses-view');
    const detail = document.getElementById('school-course-detail');
    const createButton = document.getElementById('school-create-course');
    const staffSection = document.getElementById('school-staff-section');
    const studentSection = document.getElementById('school-student-section');
    if(!list || !detail) return;
    if(createButton) createButton.style.display = canManageSchool() ? '' : 'none';
    const settingsButton = document.getElementById('school-club-settings');
    if(settingsButton) settingsButton.style.display = canManageSchool() ? '' : 'none';

    const course = openedCourseId ? schoolCourses.find(item => item.id === openedCourseId) : null;
    if(course && canRunCourse(course)) {
        staffSection.style.display = 'none';
        studentSection.style.display = 'none';
        detail.style.display = 'block';
        renderCourseDetail(course);
        return;
    }
    openedCourseId = null;
    detail.style.display = 'none';

    const courses = getMyCourses();
    const isStaff = canManageSchool() || courses.length > 0;
    staffSection.style.display = isStaff ? '' : 'none';
    document.getElementById('school-staff-title').textContent = canManageSchool() ? 'Tous les cours' : "Cours que j'encadre";
    studentSection.style.display = schoolStudentViews.length ? '' : 'none';
    renderStudentCourses();
    const today = schoolToday();
    list.innerHTML = courses.map(course => {
        const dates = course.dates || [];
        const next = dates.find(date => date >= today);
        const done = dates.filter(date => date < today).length;
        const staff = (course.staffIds || []).map(getMemberName).join(', ') || 'Aucun encadrant';
        return `<div class="card interactive school-course-card" onclick="openCourse('${escapeHtml(course.id)}')">
            <div class="card-header"><span class="card-category">${escapeHtml(getCourseWeekdayLabel(course))}</span>
                <span class="school-course-count">${(course.students || []).length} élève${(course.students || []).length > 1 ? 's' : ''}</span></div>
            <div class="card-title">${escapeHtml(course.name || 'Cours')}</div>
            <p class="session-card-meta">${escapeHtml(getCourseScheduleLabel(course))}</p>
            <div class="school-course-progress"><span style="width:${dates.length ? Math.round(done / dates.length * 100) : 0}%"></span></div>
            <p class="school-course-line">${done}/${dates.length} séances · ${next ? 'Prochaine : ' + escapeHtml(formatSchoolDate(next)) : 'Terminé'}</p>
            <p class="school-course-line">${uiIcon('users')} ${escapeHtml(staff)}</p>
        </div>`;
    }).join('') || `<div class="empty-state-card">${canManageSchool()
        ? "Aucun cours pour l'instant. Créez le premier avec « Créer un cours »."
        : "Vous n'encadrez aucun cours pour l'instant."}</div>`;
}

function openCourse(courseId) {
    openedCourseId = courseId;
    openedCourseAttendance = new Map();
    showAllCourseDates = false;
    renderSchool();
    loadCourseAttendance(courseId);
}
function closeCourse() {
    openedCourseId = null;
    renderSchool();
}
function toggleAllCourseDates() {
    showAllCourseDates = !showAllCourseDates;
    const course = schoolCourses.find(item => item.id === openedCourseId);
    if(course) renderCourseDetail(course);
}
function toggleStudentCourseDates(viewId) {
    if(expandedStudentCourses.has(viewId)) expandedStudentCourses.delete(viewId);
    else expandedStudentCourses.add(viewId);
    renderStudentCourses();
}

async function loadCourseAttendance(courseId) {
    try {
        const snap = await db.collection('schoolCourses').doc(courseId).collection('attendance').get();
        if(openedCourseId !== courseId) return;
        openedCourseAttendance = new Map(snap.docs.map(doc => [doc.id, doc.data()]));
        const course = schoolCourses.find(item => item.id === courseId);
        if(course) renderCourseDetail(course);
    } catch(error) {
        console.error("Erreur de chargement des appels:", error);
    }
}

function getAttendanceSummary(course, date) {
    const record = openedCourseAttendance.get(date);
    if(!record || !record.statuses) return null;
    const students = course.students || [];
    const present = students.filter(student => record.statuses[student.id] === 'present').length;
    return { present, total: students.length };
}

function renderCourseDetail(course) {
    const detail = document.getElementById('school-course-detail');
    const today = schoolToday();
    const dates = course.dates || [];
    const manager = canManageSchool();
    // Tout encadrant du cours le gère (séances, appel, élèves, dates) ; seul le gérant
    // choisit les encadrants et supprime le cours.
    const canEdit = canRunCourse(course);
    const nextDate = dates.find(date => date >= today);
    const staff = (course.staffIds || []).map(getMemberName);

    // Par défaut, seule la prochaine date (ou la dernière si le cours est terminé) est affichée
    const focusDate = nextDate || dates[dates.length - 1];
    const visibleDates = showAllCourseDates ? dates : dates.filter(date => date === focusDate);
    const datesHtml = visibleDates.map(date => {
        const index = dates.indexOf(date);
        const summary = getAttendanceSummary(course, date);
        const session = course.sessionByDate && course.sessionByDate[date];
        const state = date < today ? 'past' : date === today ? 'today' : 'future';
        return `<div class="school-date-row school-date-${state}">
            <div class="school-date-main">
                <span class="school-date-index">${index + 1}</span>
                <div>
                    <strong>${escapeHtml(formatSchoolDate(date, true))}</strong>${state === 'today' ? '<span class="school-today-badge">Aujourd’hui</span>' : ''}
                    <div class="school-date-meta">
                        ${session ? `<button type="button" class="btn-text school-session-link" onclick="viewCourseSession('${escapeHtml(course.id)}', '${date}')">${escapeHtml(session.name || 'Séance')}</button>` : '<span class="school-muted">Aucune séance prévue</span>'}
                        ${summary ? ` · <span class="school-attendance-count">${summary.present}/${summary.total} présents</span>` : ''}
                    </div>
                </div>
            </div>
            <button type="button" class="btn-outline school-roll-button" onclick="openAttendance('${escapeHtml(course.id)}', '${date}')">${uiIcon('check')}${summary ? 'Modifier l’appel' : 'Faire l’appel'}</button>
        </div>`;
    }).join('') || '<p class="school-muted">Aucune date pour ce cours.</p>';
    const datesToggle = dates.length > 1
        ? `<button type="button" class="btn-outline show-more-button school-dates-toggle" onclick="toggleAllCourseDates()">${uiIcon('chevron-down')}${showAllCourseDates ? 'Afficher seulement la prochaine date' : `Voir toutes les dates (${dates.length})`}</button>`
        : '';

    const studentsHtml = (course.students || []).map(student => `
        <div class="school-student-row">
            <span class="school-student-avatar">${uiIcon(student.kind === 'member' ? 'user' : 'users')}</span>
            <div class="school-student-info"><strong>${escapeHtml(getStudentName(student))}</strong>
                <small>${student.kind === 'member' ? 'Membre du club' : 'Sans compte'}${student.contact ? ' · ' + escapeHtml(student.contact) : ''}</small></div>
        </div>`).join('') || '<p class="school-muted">Aucun élève inscrit.</p>';

    detail.innerHTML = `
        <button class="btn-outline back-button" onclick="closeCourse()">${uiIcon('arrow-left')}Tous les cours</button>
        <div class="school-course-header">
            <div>
                <h3 class="section-title section-title-sm">${escapeHtml(course.name || 'Cours')}</h3>
                <p class="school-course-line">${escapeHtml(getCourseScheduleLabel(course))} · ${dates.length} séances${course.skipHolidays ? ' · hors vacances (zone ' + escapeHtml(course.holidayZone || 'B') + ')' : ''}</p>
                <p class="school-course-line">${uiIcon('users')} Encadrants : ${escapeHtml(staff.join(', ') || 'aucun')}</p>
            </div>
            <div class="school-course-actions">
                ${nextDate ? `<button class="btn-primary" onclick="openAttendance('${escapeHtml(course.id)}', '${nextDate}')">${uiIcon('check')}Appel du ${escapeHtml(formatSchoolDate(nextDate))}</button>` : ''}
                ${canEdit ? `<button class="btn-outline" onclick="openCourseEditor('${escapeHtml(course.id)}')">${uiIcon('edit')}Modifier</button>` : ''}
                ${manager ? `<button class="btn-icon" style="color:var(--danger);" title="Supprimer le cours" aria-label="Supprimer le cours" onclick="deleteCourse('${escapeHtml(course.id)}')">${uiIcon('trash')}</button>` : ''}
            </div>
        </div>
        <div class="school-course-layout">
            <section class="profile-section school-dates-section">
                <h3>${showAllCourseDates ? 'Calendrier &amp; appels' : (nextDate ? 'Prochain cours' : 'Dernier cours')}</h3>
                <div class="school-date-list">${datesHtml}</div>
                ${datesToggle}
            </section>
            <section class="profile-section school-students-section">
                <div class="school-students-heading">
                    <h3>Élèves (${(course.students || []).length})</h3>
                    ${canEdit ? `<button class="btn-outline" onclick="openCourseEditor('${escapeHtml(course.id)}', true)">${uiIcon('edit')}Gérer les élèves</button>` : ''}
                </div>
                <div class="school-student-list">${studentsHtml}</div>
            </section>
        </div>`;
}

// --- Vue élève : le cours, ses dates et SES présences (sans les autres élèves ni leurs contacts) ---
function renderStudentCourses() {
    const container = document.getElementById('school-student-courses');
    if(!container) return;
    const today = schoolToday();
    container.innerHTML = schoolStudentViews.map(view => {
        const dates = view.dates || [];
        const attendance = view.attendance || {};
        const past = dates.filter(date => date < today);
        const present = past.filter(date => attendance[date] === 'present').length;
        const next = dates.find(date => date >= today);
        const expanded = expandedStudentCourses.has(view.id);
        const focusDate = next || dates[dates.length - 1];
        const chips = (expanded ? dates : dates.filter(date => date === focusDate)).map(date => {
            const status = attendance[date] || (date >= today ? 'upcoming' : 'unmarked');
            const label = { present: 'présent', absent: 'absent', upcoming: 'à venir', unmarked: 'appel non fait' }[status];
            return `<span class="school-student-date ${status}${date === today ? ' today' : ''}" title="${escapeHtml(formatSchoolDate(date, true))} : ${label}">${escapeHtml(formatSchoolDate(date))}</span>`;
        }).join('');
        return `<div class="school-student-card">
            <div class="school-student-card-header">
                <div>
                    <strong class="cycle-name">${escapeHtml(view.courseName || 'Cours')}</strong>
                    <p class="school-course-line">${escapeHtml(getCourseScheduleLabel(view))}</p>
                </div>
                <div class="school-student-stats"><strong>${present}</strong>/${past.length}<small>présences</small></div>
            </div>
            <p class="school-course-line">${next ? 'Prochain cours : ' + escapeHtml(formatSchoolDate(next, true)) : 'Cours terminé'}</p>
            <div class="school-student-dates">${chips}</div>
            ${dates.length > 1 ? `<button type="button" class="btn-text school-dates-link" onclick="toggleStudentCourseDates('${escapeHtml(view.id)}')">${expanded ? 'Afficher seulement le prochain cours' : `Voir toutes les dates (${dates.length})`}</button>` : ''}
        </div>`;
    }).join('');
}

// Met à jour la vue élève de chaque membre inscrit (création, mise à jour, suppression)
async function syncCourseStudentViews(courseId) {
    const courseRef = db.collection('schoolCourses').doc(courseId);
    const [courseSnap, attendanceSnap, viewsSnap] = await Promise.all([
        courseRef.get(),
        courseRef.collection('attendance').get(),
        db.collection('schoolStudentViews').where('courseId', '==', courseId).get()
    ]);
    const batch = db.batch();
    const wanted = new Set();
    if(courseSnap.exists) {
        const course = courseSnap.data();
        (course.students || []).filter(student => student.kind === 'member' && student.userId).forEach(student => {
            const attendance = {};
            attendanceSnap.docs.forEach(doc => {
                const status = (doc.data().statuses || {})[student.id];
                if(status === 'present' || status === 'absent') attendance[doc.id] = status;
            });
            const viewId = `${courseId}_${student.userId}`;
            wanted.add(viewId);
            batch.set(db.collection('schoolStudentViews').doc(viewId), {
                userId: student.userId,
                clubId: course.clubId,
                courseId,
                courseName: course.name || 'Cours',
                startDate: course.startDate || '',
                startTime: course.startTime || '',
                endTime: course.endTime || '',
                dates: course.dates || [],
                attendance,
                updatedAt: Date.now()
            });
        });
    }
    viewsSnap.docs.forEach(doc => { if(!wanted.has(doc.id)) batch.delete(doc.ref); });
    await batch.commit();
}
async function syncCourseStudentViewsSafely(courseId) {
    try {
        await syncCourseStudentViews(courseId);
    } catch(error) {
        console.error("Mise à jour des vues élèves impossible:", error);
        alert("Les modifications sont enregistrées, mais l'onglet École des élèves n'a pas pu être mis à jour : " + error.message);
    }
}

// --- Élèves (gérés dans la fenêtre de création / modification du cours) ---
// Les identifiants des élèves restent stables : les appels déjà faits restent rattachés à chacun.
let studentIdCounter = 0;
function newStudentId() {
    studentIdCounter++;
    return `stu_${Date.now()}_${studentIdCounter}`;
}
function renderCourseEditorStudents() {
    const state = courseEditorState;
    const list = document.getElementById('course-students-list');
    const select = document.getElementById('course-add-member');
    if(!state || !list || !select) return;
    list.innerHTML = state.students.map(student => `
        <div class="school-student-row">
            <span class="school-student-avatar">${uiIcon(student.kind === 'member' ? 'user' : 'users')}</span>
            <div class="school-student-info"><strong>${escapeHtml(getStudentName(student))}</strong>
                <small>${student.kind === 'member' ? 'Membre du club' : 'Sans compte'}${student.contact ? ' · ' + escapeHtml(student.contact) : ''}</small></div>
            <button type="button" class="btn-icon" style="color:var(--danger);" title="Retirer ${escapeHtml(getStudentName(student))}" aria-label="Retirer ${escapeHtml(getStudentName(student))}" onclick="removeEditorStudent('${escapeHtml(student.id)}')">${uiIcon('trash')}</button>
        </div>`).join('') || '<p class="school-muted">Aucun élève pour l’instant.</p>';
    document.getElementById('course-students-count').textContent = state.students.length
        ? `${state.students.length} élève${state.students.length > 1 ? 's' : ''}` : '';
    const taken = new Set(state.students.map(student => student.userId).filter(Boolean));
    select.innerHTML = '<option value="">Membre du club…</option>' + clubMembers
        .filter(member => !taken.has(member.id))
        .sort((a, b) => String(a.username || '').localeCompare(String(b.username || ''), 'fr', { sensitivity: 'base' }))
        .map(member => `<option value="${escapeHtml(member.id)}">${escapeHtml(member.username)}</option>`).join('');
    // Panneau de recherche avec photos : choisir un membre l'ajoute directement
    enhanceSelect(select, {
        keepPlaceholder: true,
        placeholder: 'Ajouter un membre du club',
        search: true,
        searchPlaceholder: 'Rechercher un membre…',
        avatar: memberPickerAvatar,
        detail: userId => {
            const member = clubMembers.find(user => user.id === userId);
            return member ? getRoleLabel(getClubRole(member, currentUser.clubId)) : '';
        },
        emptyText: 'Tous les membres du club sont déjà inscrits.'
    });
}
function addEditorMemberStudent() {
    const state = courseEditorState;
    const select = document.getElementById('course-add-member');
    if(!state || !select.value) return;
    const member = clubMembers.find(user => user.id === select.value);
    state.students.push({ id: newStudentId(), kind: 'member', userId: select.value, name: member ? member.username : '', contact: '' });
    renderCourseEditorStudents();
}
function addEditorGuestStudent() {
    const state = courseEditorState;
    const nameInput = document.getElementById('course-add-guest-name');
    const contactInput = document.getElementById('course-add-guest-contact');
    const name = nameInput.value.trim();
    if(!state || !name) return alert("Saisissez le nom de l'élève.");
    state.students.push({ id: newStudentId(), kind: 'guest', userId: '', name, contact: contactInput.value.trim() });
    nameInput.value = '';
    contactInput.value = '';
    nameInput.focus();
    renderCourseEditorStudents();
}
function removeEditorStudent(studentId) {
    const state = courseEditorState;
    if(!state) return;
    state.students = state.students.filter(student => student.id !== studentId);
    renderCourseEditorStudents();
}

async function deleteCourse(courseId) {
    const course = schoolCourses.find(item => item.id === courseId);
    if(!course || !canManageSchool()) return;
    if(!await showAppConfirm(`Supprimer le cours « ${course.name} » et tous ses appels ? Cette action est définitive.`)) return;
    try {
        const [attendance, views] = await Promise.all([
            db.collection('schoolCourses').doc(courseId).collection('attendance').get(),
            db.collection('schoolStudentViews').where('courseId', '==', courseId).get()
        ]);
        const batch = db.batch();
        attendance.docs.forEach(doc => batch.delete(doc.ref));
        views.docs.forEach(doc => batch.delete(doc.ref));
        batch.delete(db.collection('schoolCourses').doc(courseId));
        await batch.commit();
        openedCourseId = null;
        renderSchool();
    } catch(error) {
        console.error("Erreur de suppression du cours:", error);
        alert("Impossible de supprimer le cours : " + error.message);
    }
}

// ==========================================================================
// CRÉATION / MODIFICATION D'UN COURS
// ==========================================================================
// focusStudents : ouvre directement sur la partie « Élèves » (bouton « Gérer les élèves »)
function openCourseEditor(courseId = null, focusStudents = false) {
    const course = courseId ? schoolCourses.find(item => item.id === courseId) : null;
    // Création : gérant uniquement. Modification : gérant ou encadrant du cours.
    if(course ? !canRunCourse(course) : !canManageSchool()) return;
    const canChooseStaff = canManageSchool();
    courseEditorState = {
        courseId: course ? course.id : null,
        excludedDates: [...((course && course.excludedDates) || [])],
        extraDates: [...((course && course.extraDates) || [])],
        students: ((course && course.students) || []).map(student => ({ ...student })),
        holidays: [],
        dates: [],
        skipped: []
    };
    document.getElementById('school-course-modal-title').textContent = course ? 'Modifier le cours' : 'Créer un cours';
    document.getElementById('course-name').value = course ? course.name || '' : '';
    document.getElementById('course-start-date').value = course ? course.startDate || '' : schoolToday();
    document.getElementById('course-start-time').value = course ? course.startTime || '' : '18:00';
    document.getElementById('course-end-time').value = course ? course.endTime || '' : '19:30';
    document.getElementById('course-session-count').value = course ? course.sessionCount || 30 : 30;
    document.getElementById('course-skip-holidays').checked = course ? course.skipHolidays !== false : true;
    document.getElementById('course-holiday-zone').value = course ? course.holidayZone || 'B' : 'B';
    enhanceChoices(document.getElementById('course-holiday-zone'), { variant: 'pills', label: 'Zone de vacances' });
    document.getElementById('course-extra-date').value = '';

    const selectedStaff = new Set((course && course.staffIds) || []);
    document.getElementById('course-staff-list').innerHTML = canChooseStaff
        ? (getSchoolStaffCandidates().map(member => `
        <label class="school-staff-option">
            <input type="checkbox" value="${escapeHtml(member.id)}" ${selectedStaff.has(member.id) ? 'checked' : ''}>
            <span>${escapeHtml(member.username)}</span><small>${escapeHtml(getRoleLabel(getClubRole(member, currentUser.clubId)))}</small>
        </label>`).join('') || '<p class="school-muted">Aucun initiateur, coach ou entraîneur dans le club pour l’instant.</p>')
        : `<p class="school-muted">${escapeHtml([...selectedStaff].map(getMemberName).join(', ') || 'Aucun encadrant')} — seul le gérant peut modifier les encadrants.</p>`;

    document.getElementById('course-add-guest-name').value = '';
    document.getElementById('course-add-guest-contact').value = '';
    renderCourseEditorStudents();
    openModal('modal-school-course');
    refreshCourseDatesPreview();
    if(focusStudents) {
        const section = document.getElementById('course-students-section');
        if(section) section.scrollIntoView({ block: 'start' });
    }
}

async function refreshCourseDatesPreview() {
    if(!courseEditorState) return;
    const state = courseEditorState;
    const startDate = document.getElementById('course-start-date').value;
    const sessionCount = Math.min(SCHOOL_MAX_SESSIONS, Math.max(1, parseInt(document.getElementById('course-session-count').value, 10) || 1));
    const skipHolidays = document.getElementById('course-skip-holidays').checked;
    const zone = document.getElementById('course-holiday-zone').value;
    document.getElementById('course-holiday-zone').disabled = !skipHolidays;
    enhanceChoices(document.getElementById('course-holiday-zone'));
    const status = document.getElementById('course-holiday-status');

    state.holidays = [];
    if(skipHolidays) {
        status.textContent = 'Chargement du calendrier scolaire…';
        try {
            state.holidays = await fetchSchoolHolidays(zone);
            status.textContent = '';
        } catch(error) {
            console.error("Calendrier scolaire indisponible:", error);
            status.textContent = "Calendrier scolaire indisponible : les vacances ne sont pas retirées. Retirez les dates à la main si besoin.";
        }
    } else {
        status.textContent = '';
    }
    if(courseEditorState !== state) return;
    const result = computeCourseDates({
        startDate, sessionCount, skipHolidays,
        holidays: state.holidays,
        excludedDates: state.excludedDates,
        extraDates: state.extraDates
    });
    state.dates = result.dates;
    state.skipped = result.skipped;
    renderCourseDatesPreview();
}

function renderCourseDatesPreview() {
    const state = courseEditorState;
    const preview = document.getElementById('course-dates-preview');
    if(!state || !preview) return;
    const holidaySkips = state.skipped.filter(item => item.reason !== 'Retirée');
    preview.innerHTML = `
        <p class="settings-hint">${state.dates.length} séance${state.dates.length > 1 ? 's' : ''}${state.dates.length ? ` du ${escapeHtml(formatSchoolDate(state.dates[0], true))} au ${escapeHtml(formatSchoolDate(state.dates[state.dates.length - 1], true))}` : ''}.
        Touchez une date pour la retirer (le cours est alors prolongé d'une semaine).</p>
        <div class="school-date-chips">
            ${state.dates.map(date => `<button type="button" class="school-date-chip${state.extraDates.includes(date) ? ' extra' : ''}" title="Retirer cette date" onclick="toggleCourseDate('${date}')">${escapeHtml(formatSchoolDate(date))}${uiIcon('close')}</button>`).join('')}
        </div>
        ${state.excludedDates.length ? `<p class="settings-hint">Dates retirées à la main :</p><div class="school-date-chips">${state.excludedDates.slice().sort().map(date => `<button type="button" class="school-date-chip removed" title="Remettre cette date" onclick="toggleCourseDate('${date}')">${escapeHtml(formatSchoolDate(date))}${uiIcon('plus')}</button>`).join('')}</div>` : ''}
        ${holidaySkips.length ? `<p class="settings-hint">${holidaySkips.length} date${holidaySkips.length > 1 ? 's' : ''} sautée${holidaySkips.length > 1 ? 's' : ''} pendant les vacances scolaires.</p>` : ''}`;
}

function toggleCourseDate(date) {
    const state = courseEditorState;
    if(!state) return;
    if(state.extraDates.includes(date)) {
        state.extraDates = state.extraDates.filter(item => item !== date);
    } else if(state.excludedDates.includes(date)) {
        state.excludedDates = state.excludedDates.filter(item => item !== date);
    } else {
        state.excludedDates.push(date);
    }
    refreshCourseDatesPreview();
}

function addCourseExtraDate() {
    const state = courseEditorState;
    const input = document.getElementById('course-extra-date');
    if(!state || !input.value) return alert("Choisissez une date à ajouter.");
    if(state.dates.includes(input.value)) return alert("Cette date fait déjà partie du cours.");
    state.excludedDates = state.excludedDates.filter(item => item !== input.value);
    state.extraDates.push(input.value);
    input.value = '';
    refreshCourseDatesPreview();
}

async function saveCourse() {
    const state = courseEditorState;
    if(!state) return;
    const existingCourse = state.courseId ? schoolCourses.find(item => item.id === state.courseId) : null;
    const canChooseStaff = canManageSchool();
    if(existingCourse ? !canRunCourse(existingCourse) : !canChooseStaff) return alert("Vous ne pouvez pas modifier ce cours.");
    const name = document.getElementById('course-name').value.trim();
    const startDate = document.getElementById('course-start-date').value;
    const startTime = document.getElementById('course-start-time').value;
    const endTime = document.getElementById('course-end-time').value;
    const sessionCount = parseInt(document.getElementById('course-session-count').value, 10);
    if(!name) return alert("Donnez un nom au cours.");
    if(!startDate) return alert("Choisissez la date du premier cours.");
    if(!startTime) return alert("Indiquez l'heure de début.");
    if(endTime && endTime <= startTime) return alert("L'heure de fin doit être après l'heure de début.");
    if(!sessionCount || sessionCount < 1 || sessionCount > SCHOOL_MAX_SESSIONS) return alert(`Le nombre de séances doit être compris entre 1 et ${SCHOOL_MAX_SESSIONS}.`);
    if(!state.dates.length) return alert("Le cours ne contient aucune date.");

    const staffIds = canChooseStaff
        ? [...document.querySelectorAll('#course-staff-list input:checked')].map(input => input.value)
        : ((existingCourse && existingCourse.staffIds) || []);
    const data = {
        name, startDate, startTime, endTime, sessionCount,
        students: state.students,
        skipHolidays: document.getElementById('course-skip-holidays').checked,
        holidayZone: document.getElementById('course-holiday-zone').value,
        excludedDates: state.excludedDates,
        extraDates: state.extraDates,
        dates: state.dates,
        updatedAt: Date.now()
    };
    // Les encadrants ne sont modifiables que par le gérant
    if(canChooseStaff) data.staffIds = staffIds;
    const button = document.getElementById('course-save-button');
    button.disabled = true;
    try {
        if(state.courseId) {
            await db.collection('schoolCourses').doc(state.courseId).update(data);
            // Les dates ou l'horaire ont pu changer : on met à jour la vue des élèves
            await syncCourseStudentViewsSafely(state.courseId);
        } else {
            const id = 'course_' + Date.now();
            await db.collection('schoolCourses').doc(id).set({
                ...data, id, clubId: currentUser.clubId, sessionByDate: {},
                createdBy: currentUser.id, createdAt: Date.now()
            });
            openedCourseId = id;
            showAllCourseDates = false;
            // Élèves inscrits dès la création : ils voient tout de suite le cours dans leur onglet École
            await syncCourseStudentViewsSafely(id);
        }
        closeModal('modal-school-course');
        courseEditorState = null;
        if(!document.getElementById('school-space').classList.contains('active')) switchTab('school');
        else renderSchool();
    } catch(error) {
        console.error("Erreur d'enregistrement du cours:", error);
        alert("Impossible d'enregistrer le cours : " + error.message);
    } finally {
        button.disabled = false;
    }
}

// ==========================================================================
// APPEL
// ==========================================================================
async function openAttendance(courseId, date) {
    const course = schoolCourses.find(item => item.id === courseId);
    if(!course || !canRunCourse(course)) return;
    let record = openedCourseId === courseId ? openedCourseAttendance.get(date) : null;
    if(!record) {
        try {
            const snap = await db.collection('schoolCourses').doc(courseId).collection('attendance').doc(date).get();
            record = snap.exists ? snap.data() : null;
        } catch(error) {
            console.error("Erreur de chargement de l'appel:", error);
        }
    }
    attendanceState = { courseId, date, statuses: { ...((record && record.statuses) || {}) } };
    document.getElementById('attendance-title').textContent = `Appel du ${formatSchoolDate(date, true)}`;
    document.getElementById('attendance-subtitle').textContent = `${course.name}${course.startTime ? ' · ' + course.startTime : ''}${record && record.updatedByName ? ' · dernier appel par ' + record.updatedByName : ''}`;
    renderAttendanceList();
    openModal('modal-school-attendance');
}

function renderAttendanceList() {
    const state = attendanceState;
    const course = state && schoolCourses.find(item => item.id === state.courseId);
    const list = document.getElementById('attendance-list');
    if(!course || !list) return;
    const students = course.students || [];
    list.innerHTML = students.map(student => {
        const status = state.statuses[student.id] || '';
        return `<div class="attendance-row attendance-${status || 'unset'}">
            <strong>${escapeHtml(getStudentName(student))}</strong>
            <div class="attendance-toggle" role="group" aria-label="Présence de ${escapeHtml(getStudentName(student))}">
                <button type="button" class="${status === 'present' ? 'active' : ''}" aria-pressed="${status === 'present'}" onclick="setAttendanceStatus('${escapeHtml(student.id)}', 'present')">Présent</button>
                <button type="button" class="${status === 'absent' ? 'active' : ''}" aria-pressed="${status === 'absent'}" onclick="setAttendanceStatus('${escapeHtml(student.id)}', 'absent')">Absent</button>
            </div>
        </div>`;
    }).join('') || '<p class="school-muted">Aucun élève inscrit à ce cours.</p>';
    const present = students.filter(student => state.statuses[student.id] === 'present').length;
    const marked = students.filter(student => state.statuses[student.id]).length;
    document.getElementById('attendance-count').textContent = `${present} présent${present > 1 ? 's' : ''} sur ${students.length}${marked < students.length ? ` · ${students.length - marked} non pointé${students.length - marked > 1 ? 's' : ''}` : ''}`;
}

function setAttendanceStatus(studentId, status) {
    if(!attendanceState) return;
    attendanceState.statuses[studentId] = attendanceState.statuses[studentId] === status ? '' : status;
    if(!attendanceState.statuses[studentId]) delete attendanceState.statuses[studentId];
    renderAttendanceList();
}
function markAllPresent() {
    const course = attendanceState && schoolCourses.find(item => item.id === attendanceState.courseId);
    if(!course) return;
    (course.students || []).forEach(student => { attendanceState.statuses[student.id] = 'present'; });
    renderAttendanceList();
}

async function saveAttendance() {
    const state = attendanceState;
    if(!state) return;
    const course = schoolCourses.find(item => item.id === state.courseId);
    // On ne garde que les élèves encore inscrits
    const studentIds = new Set(((course && course.students) || []).map(student => student.id));
    const statuses = Object.fromEntries(Object.entries(state.statuses).filter(([id, value]) => studentIds.has(id) && ['present', 'absent'].includes(value)));
    const record = {
        date: state.date,
        statuses,
        updatedBy: currentUser.id,
        updatedByName: currentUser.username || '',
        updatedAt: Date.now()
    };
    const button = document.getElementById('attendance-save-button');
    button.disabled = true;
    try {
        await db.collection('schoolCourses').doc(state.courseId).collection('attendance').doc(state.date).set(record);
        // Chaque élève membre du club voit sa présence dans son onglet École
        await syncCourseStudentViewsSafely(state.courseId);
        if(openedCourseId === state.courseId) {
            openedCourseAttendance.set(state.date, record);
            if(course) renderCourseDetail(course);
        }
        closeModal('modal-school-attendance');
        attendanceState = null;
    } catch(error) {
        console.error("Erreur d'enregistrement de l'appel:", error);
        alert("Impossible d'enregistrer l'appel : " + error.message);
    } finally {
        button.disabled = false;
    }
}

// ==========================================================================
// ATTRIBUER UNE SÉANCE À UN COURS
// ==========================================================================
// Bouton « Attribuer » de la bibliothèque : l'initiateur attribue à un cours,
// le coach et plus choisissent entre les membres et l'école d'escalade.
async function startSessionAssignment(sessionId) {
    const courses = getMyCourses();
    if(!hasCoachRights()) {
        if(!courses.length) return alert("Vous n'encadrez aucun cours de l'école d'escalade pour l'instant : demandez au gérant de vous y ajouter.");
        return openSchoolAssignModal(sessionId);
    }
    if(!courses.length) return openAssignModal(sessionId);
    const target = await showAppChoice("À qui attribuer cette séance ?", [
        { label: 'À des membres du club', value: 'members' },
        { label: "À un cours de l'école d'escalade", value: 'school' }
    ]);
    if(target === 'members') openAssignModal(sessionId);
    else if(target === 'school') openSchoolAssignModal(sessionId);
}

function openSchoolAssignModal(sessionId) {
    const session = clubSessions.find(item => item.id === sessionId);
    if(!session) return alert("Cette séance n'est plus disponible.");
    schoolAssignSessionId = sessionId;
    const select = document.getElementById('school-assign-course');
    select.innerHTML = getMyCourses().map(course => `<option value="${escapeHtml(course.id)}">${escapeHtml(course.name)}</option>`).join('');
    // Cartes de choix : nom du cours, jour et horaire
    enhanceChoices(select, { variant: 'cards', label: 'Cours', detail: courseId => {
        const course = schoolCourses.find(item => item.id === courseId);
        return course ? getCourseScheduleLabel(course) : '';
    } });
    document.getElementById('school-assign-session-name').textContent = session.name || 'Séance';
    renderSchoolAssignDates();
    openModal('modal-school-assign');
}

function renderSchoolAssignDates() {
    const course = schoolCourses.find(item => item.id === document.getElementById('school-assign-course').value);
    const container = document.getElementById('school-assign-dates');
    if(!course) { container.innerHTML = ''; return; }
    const today = schoolToday();
    const upcoming = (course.dates || []).filter(date => date >= today);
    container.innerHTML = upcoming.map((date, index) => {
        const current = course.sessionByDate && course.sessionByDate[date];
        return `<label class="school-assign-date">
            <input type="checkbox" value="${date}" ${index === 0 ? 'checked' : ''}>
            <span><strong>${escapeHtml(formatSchoolDate(date, true))}</strong>
            <small>${current ? 'Actuellement : ' + escapeHtml(current.name || 'Séance') : 'Aucune séance prévue'}</small></span>
        </label>`;
    }).join('') || '<p class="school-muted">Ce cours n’a plus de date à venir.</p>';
}

async function saveSchoolAssignment() {
    const session = clubSessions.find(item => item.id === schoolAssignSessionId);
    const course = schoolCourses.find(item => item.id === document.getElementById('school-assign-course').value);
    const dates = [...document.querySelectorAll('#school-assign-dates input:checked')].map(input => input.value);
    if(!session || !course) return alert("Séance ou cours introuvable.");
    if(!canRunCourse(course)) return alert("Vous n'encadrez pas ce cours.");
    if(!dates.length) return alert("Cochez au moins une date.");
    const button = document.getElementById('school-assign-save');
    button.disabled = true;
    try {
        // On enregistre une copie des exercices : tous les encadrants du cours peuvent la consulter
        const blocks = (await getClubSessionBlockSnapshots(session)).slice(0, 100).map(block => ({
            title: String(block.title || '').slice(0, 200),
            category: String(block.category || '').slice(0, 80),
            description: String(block.description || '').slice(0, 5000)
        }));
        const entry = {
            sessionId: session.id,
            name: String(session.name || 'Séance').slice(0, 120),
            blocks,
            assignedBy: currentUser.id,
            assignedByName: currentUser.username || '',
            assignedAt: Date.now()
        };
        const updates = { updatedAt: Date.now() };
        dates.forEach(date => { updates[`sessionByDate.${date}`] = entry; });
        await db.collection('schoolCourses').doc(course.id).update(updates);
        closeModal('modal-school-assign');
        alert(`« ${entry.name} » est prévue pour ${dates.length} date${dates.length > 1 ? 's' : ''} du cours « ${course.name} ».`);
    } catch(error) {
        console.error("Erreur d'attribution au cours:", error);
        alert("Impossible d'attribuer la séance au cours : " + error.message);
    } finally {
        button.disabled = false;
    }
}

function viewCourseSession(courseId, date) {
    const course = schoolCourses.find(item => item.id === courseId);
    const entry = course && course.sessionByDate && course.sessionByDate[date];
    if(!entry) return;
    document.getElementById('school-session-title').textContent = entry.name || 'Séance';
    document.getElementById('school-session-meta').textContent = `${course.name} · ${formatSchoolDate(date, true)}${entry.assignedByName ? ' · prévue par ' + entry.assignedByName : ''}`;
    document.getElementById('school-session-blocks').innerHTML = (entry.blocks || []).map((block, index) => `
        <div class="session-view-block"${categoryColorStyle(block.category)}>
            <div class="card-category" style="margin-bottom:0.5rem;">${escapeHtml(block.category || 'Exercice')}</div>
            <div class="club-session-detail-title">${index + 1}. ${escapeHtml(block.title || 'Exercice')}</div>
            <div class="club-session-detail-description">${escapeHtml(block.description || '')}</div>
        </div>`).join('') || '<p class="school-muted">Cette séance ne contient aucun exercice.</p>';
    document.getElementById('school-session-remove').style.display = canRunCourse(course) ? '' : 'none';
    document.getElementById('school-session-remove').onclick = () => removeCourseSession(courseId, date);
    openModal('modal-school-session');
}

async function removeCourseSession(courseId, date) {
    if(!await showAppConfirm("Retirer cette séance de cette date du cours ?")) return;
    try {
        await db.collection('schoolCourses').doc(courseId).update({
            [`sessionByDate.${date}`]: firebase.firestore.FieldValue.delete(),
            updatedAt: Date.now()
        });
        closeModal('modal-school-session');
    } catch(error) {
        alert("Impossible de retirer la séance : " + error.message);
    }
}

// ==========================================================================
// CYCLES D'ENTRAÎNEMENT (profil de chaque membre)
// ==========================================================================
function startOwnCyclesListener(generation) {
    if(!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    listeners.push(db.collection('users').doc(uid).collection('cycles').onSnapshot(snap => {
        if(generation !== realtimeListenerGeneration || !auth.currentUser) return;
        cyclesCache.set(uid, snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        if(document.getElementById('athlete-profile-space').classList.contains('active')) renderOwnCycles();
    }, error => handleRealtimeListenerError("vos cycles d'entraînement", generation, error)));
}

async function loadUserCycles(userId) {
    const snap = await db.collection('users').doc(userId).collection('cycles').get();
    const cycles = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    cyclesCache.set(userId, cycles);
    return cycles;
}

function canEditCyclesOf(userId) {
    if(originalParentUser) return false;
    return (auth.currentUser && auth.currentUser.uid === userId) || canManageCycles();
}

// Séances terminées par le membre pendant la période du cycle
function getCycleDoneAssignments(cycle, userId) {
    const start = cycle.startDate ? schoolParseDate(cycle.startDate).getTime() : 0;
    const end = cycle.endDate ? schoolParseDate(cycle.endDate).getTime() + 24 * 3600 * 1000 - 1 : Infinity;
    return clubAssignments
        .filter(assignment => assignment.athleteId === userId && assignment.isDone && typeof assignment.doneAt === 'number' &&
            assignment.doneAt >= start && assignment.doneAt <= end)
        .sort((a, b) => b.doneAt - a.doneAt);
}

function renderCyclesInto(containerId, userId) {
    const container = document.getElementById(containerId);
    if(!container) return;
    if(!cyclesCache.has(userId)) {
        container.innerHTML = '<p class="school-muted">Chargement…</p>';
        loadUserCycles(userId).then(() => renderCyclesInto(containerId, userId)).catch(error => {
            console.error("Erreur de chargement des cycles:", error);
            container.innerHTML = '<p class="school-muted">Impossible de charger les cycles.</p>';
        });
        return;
    }
    const today = schoolToday();
    const canEdit = canEditCyclesOf(userId);
    const cycles = [...cyclesCache.get(userId)].sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
    container.innerHTML = cycles.map(cycle => {
        const done = getCycleDoneAssignments(cycle, userId);
        const target = Math.max(1, Number(cycle.targetSessions) || 1);
        const percent = Math.min(100, Math.round(done.length / target * 100));
        const finished = cycle.endDate && cycle.endDate < today;
        const status = done.length >= target ? 'Objectif atteint' : finished ? 'Terminé' : cycle.startDate > today ? 'À venir' : 'En cours';
        const period = cycle.endDate
            ? `${formatSchoolDate(cycle.startDate, true)} → ${formatSchoolDate(cycle.endDate, true)}`
            : `Depuis le ${formatSchoolDate(cycle.startDate, true)}`;
        const history = done.map(assignment => {
            const session = getAssignmentSession(assignment);
            return `<li><span>${escapeHtml(new Date(assignment.doneAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }))}</span>
                <strong>${escapeHtml((session && session.name) || 'Séance')}</strong>
                ${assignment.avgRpe ? `<small>RPE ${Number(assignment.avgRpe).toFixed(1)}</small>` : ''}</li>`;
        }).join('');
        return `<div class="cycle-card">
            <div class="cycle-card-header">
                <div><strong class="cycle-name">${escapeHtml(cycle.name || 'Cycle')}</strong>
                    <span class="cycle-status cycle-status-${status === 'En cours' ? 'active' : status === 'Objectif atteint' ? 'done' : 'idle'}">${status}</span></div>
                ${canEdit ? `<div class="cycle-actions">
                    <button class="btn-icon" title="Modifier" aria-label="Modifier le cycle" onclick="openCycleModal('${escapeHtml(userId)}', '${escapeHtml(cycle.id)}')">${uiIcon('edit')}</button>
                    <button class="btn-icon" style="color:var(--danger);" title="Supprimer" aria-label="Supprimer le cycle" onclick="deleteCycle('${escapeHtml(userId)}', '${escapeHtml(cycle.id)}')">${uiIcon('trash')}</button>
                </div>` : ''}
            </div>
            <p class="cycle-period">${escapeHtml(period)}</p>
            <div class="cycle-progress"><span style="width:${percent}%"></span></div>
            <p class="cycle-count"><strong>${done.length}</strong> / ${target} séances réalisées</p>
            ${cycle.notes ? `<p class="cycle-notes">${escapeHtml(cycle.notes)}</p>` : ''}
            ${done.length ? `<details class="cycle-history"><summary>Historique (${done.length})</summary><ul>${history}</ul></details>` : ''}
        </div>`;
    }).join('') || '<p class="school-muted">Aucun cycle pour l’instant.</p>';
}

function renderOwnCycles() {
    if(!currentUser) return;
    // Les cycles font partie de l'entraînement : masqués dans un club « école seule »
    const list = document.getElementById('profile-cycles-list');
    const section = list && list.closest('.profile-section');
    if(section) section.style.display = isTrainingEnabled() ? '' : 'none';
    if(!isTrainingEnabled()) return;
    const button = document.getElementById('profile-new-cycle');
    if(button) button.style.display = canEditCyclesOf(currentUser.id) ? '' : 'none';
    renderCyclesInto('profile-cycles-list', currentUser.id);
}

function renderMemberCycles(userId) {
    const section = document.getElementById('view-athlete-cycles-section');
    if(!section) return;
    section.style.display = canManageCycles() ? '' : 'none';
    if(!canManageCycles()) return;
    cyclesCache.delete(userId); // on recharge à chaque ouverture de la fiche
    renderCyclesInto('view-athlete-cycles', userId);
}

function openCycleModal(userId, cycleId = null) {
    if(!canEditCyclesOf(userId)) return;
    const cycle = cycleId ? (cyclesCache.get(userId) || []).find(item => item.id === cycleId) : null;
    editingCycle = { userId, cycleId: cycle ? cycle.id : null };
    document.getElementById('cycle-modal-title').textContent = cycle ? 'Modifier le cycle' : 'Nouveau cycle';
    document.getElementById('cycle-name').value = cycle ? cycle.name || '' : '';
    document.getElementById('cycle-target').value = cycle ? cycle.targetSessions || 12 : 12;
    document.getElementById('cycle-start').value = cycle ? cycle.startDate || '' : schoolToday();
    document.getElementById('cycle-end').value = cycle ? cycle.endDate || '' : '';
    document.getElementById('cycle-notes').value = cycle ? cycle.notes || '' : '';
    openModal('modal-cycle');
}

async function saveCycle() {
    if(!editingCycle) return;
    const name = document.getElementById('cycle-name').value.trim();
    const targetSessions = parseInt(document.getElementById('cycle-target').value, 10);
    const startDate = document.getElementById('cycle-start').value;
    const endDate = document.getElementById('cycle-end').value;
    const notes = document.getElementById('cycle-notes').value.trim();
    if(!name) return alert("Donnez un nom au cycle.");
    if(!targetSessions || targetSessions < 1 || targetSessions > 500) return alert("Le nombre de séances doit être compris entre 1 et 500.");
    if(!startDate) return alert("Choisissez la date de début du cycle.");
    if(endDate && endDate < startDate) return alert("La date de fin doit être après la date de début.");
    const { userId, cycleId } = editingCycle;
    const data = { name, targetSessions, startDate, endDate, notes, updatedBy: auth.currentUser.uid, updatedAt: Date.now() };
    const collection = db.collection('users').doc(userId).collection('cycles');
    try {
        if(cycleId) await collection.doc(cycleId).update(data);
        else await collection.add({ ...data, createdBy: auth.currentUser.uid, createdAt: Date.now() });
        closeModal('modal-cycle');
        editingCycle = null;
        if(userId !== auth.currentUser.uid) {
            await loadUserCycles(userId);
            renderCyclesInto('view-athlete-cycles', userId);
        }
    } catch(error) {
        console.error("Erreur d'enregistrement du cycle:", error);
        alert("Impossible d'enregistrer le cycle : " + error.message);
    }
}

async function deleteCycle(userId, cycleId) {
    if(!canEditCyclesOf(userId)) return;
    if(!await showAppConfirm("Supprimer ce cycle ? Les séances réalisées restent dans l'historique.")) return;
    try {
        await db.collection('users').doc(userId).collection('cycles').doc(cycleId).delete();
        if(userId !== auth.currentUser.uid) {
            await loadUserCycles(userId);
            renderCyclesInto('view-athlete-cycles', userId);
        }
    } catch(error) {
        alert("Impossible de supprimer le cycle : " + error.message);
    }
}
