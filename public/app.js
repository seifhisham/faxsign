// Global variables
let currentUser = null;
let currentToken = null;
let isCurrentUserPrivileged = false;
let signatureCanvas = null;
let signatureContext = null;
let isDrawing = false;
let currentWorkflowId = null;
let availableDepartments = [];

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    // Check if user is already logged in
    const token = localStorage.getItem('token');
    if (token) {
        currentToken = token;
        currentUser = JSON.parse(localStorage.getItem('user'));
        showMainApp();
    } else {
        // If no user is logged in, ensure all admin content is hidden
        hideAllAdminContent();
    }

    // Setup event listeners
    setupEventListeners();
    setupSignatureCanvas();
});

// Preview cache to avoid refetching (global)
const faxPreviewCache = new Map(); // faxId -> { url, type }

async function loadFaxPreview(faxId) {
    try {
        // If cached, render from cache
        if (faxPreviewCache.has(faxId)) {
            renderPreview(faxId, faxPreviewCache.get(faxId));
            return;
        }
        const res = await fetch(`/api/faxes/${faxId}/file`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const container = document.getElementById(`fax-preview-${faxId}`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            if (container) container.innerHTML = `<div style="padding:16px; color:#e53e3e;">${err.error || 'Failed to load preview'}</div>`;
            return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const meta = { url, type: blob.type || '' };
        faxPreviewCache.set(faxId, meta);
        renderPreview(faxId, meta);
    } catch (e) {
        const container = document.getElementById(`fax-preview-${faxId}`);
        if (container) container.innerHTML = `<div style="padding:16px; color:#e53e3e;">Failed to load preview</div>`;
    }
}

function renderPreview(faxId, meta) {
    const container = document.getElementById(`fax-preview-${faxId}`);
    if (!container) return;
    const isImage = meta.type && meta.type.startsWith('image/');
    // Compact preview: image or small iframe
    if (isImage) {
        container.innerHTML = `<img src="${meta.url}" alt="Fax preview" style="display:block; width:100%; max-height:220px; object-fit:contain; background:white;" />`;
    } else {
        container.innerHTML = `<iframe src="${meta.url}" title="Fax preview" style="width:100%; height:220px; border:0; background:white;"></iframe>`;
    }
}

function maximizeFax(faxId) {
    // Use preview cache if available, otherwise fallback to existing viewFax fetch
    const meta = faxPreviewCache.get(faxId);
    const modal = document.getElementById('faxViewerModal');
    const frame = document.getElementById('faxViewerFrame');
    const img = document.getElementById('faxViewerImage');

    // Reset views
    frame.style.display = 'none';
    frame.src = 'about:blank';
    if (img) {
        img.style.display = 'none';
        img.removeAttribute('src');
    }

    if (meta && meta.url) {
        // Use cached preview URL; do not revoke on close
        currentFaxObjectUrl = meta.url;
        modalOwnsUrl = false;
        frame.src = meta.url;
        frame.style.display = 'block';
        modal.style.display = 'block';
        return;
    }
    // Not cached yet, fetch via viewFax
    viewFax(faxId);
}

// Setup event listeners
function setupEventListeners() {
    // Login form
    document.getElementById('loginFormElement').addEventListener('submit', handleLogin);
    
    // Upload form
    document.getElementById('uploadForm').addEventListener('submit', handleUpload);
    
    // Workflow form (removed tab) - guard in case element doesn't exist
    const wfForm = document.getElementById('workflowForm');
    if (wfForm) {
        wfForm.addEventListener('submit', handleCreateWorkflow);
    }
    
    // File upload
    document.getElementById('faxFile').addEventListener('change', handleFileSelect);
    
    // Department form
    document.getElementById('addDepartmentForm').addEventListener('submit', handleAddDepartment);
}

// Setup signature canvas
function setupSignatureCanvas() {
    signatureCanvas = document.getElementById('signatureCanvas');
    signatureContext = signatureCanvas.getContext('2d');
    
    signatureCanvas.addEventListener('mousedown', startDrawing);
    signatureCanvas.addEventListener('mousemove', draw);
    signatureCanvas.addEventListener('mouseup', stopDrawing);
    signatureCanvas.addEventListener('mouseout', stopDrawing);
    
    // Touch events for mobile
    signatureCanvas.addEventListener('touchstart', handleTouchStart);
    signatureCanvas.addEventListener('touchmove', handleTouchMove);
    signatureCanvas.addEventListener('touchend', stopDrawing);
}

// Authentication functions
async function handleLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentToken = data.token;
            currentUser = data.user;
            
            // Store in localStorage
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            showMainApp();
            loadInitialData();
        } else {
            showLoginError(data.error);
        }
    } catch (error) {
        showLoginError('Network error. Please try again.');
    }
}

function showLoginError(message) {
    const errorDiv = document.getElementById('loginError');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    currentToken = null;
    currentUser = null;
    
    // Completely reset all tab states and content
    resetAllTabs();
    
    showLoginForm();
}

function showLoginForm() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('mainApp').style.display = 'none';
}

function showMainApp() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('userName').textContent = currentUser.full_name;
    isCurrentUserPrivileged = currentUser.role === 'admin' || currentUser.role === 'manager';
    
    // Completely reset everything and start fresh
    resetAllTabs();
    resetTabState();
    updateNavVisibility();
    
    // Security: ensure admin tabs are not visible if user is not admin
    if (!currentUser || currentUser.role !== 'admin') {
        const adminTabContents = document.querySelectorAll('#user-management, #department-management');
        adminTabContents.forEach(content => {
            content.classList.remove('active');
            content.style.display = 'none';
        });
        
        // Also hide any admin content that might be displayed
        hideAllAdminContent();
    }
}

function resetAllTabs() {
    // Hide all tab contents and remove active class
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
    });

    // Remove active class from all tabs
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => tab.classList.remove('active'));

    // Hide all admin tabs (will be shown again if user is admin)
    const adminTabs = document.querySelectorAll('.admin-only');
    adminTabs.forEach(tab => {
        tab.style.display = 'none';
    });

    // Clear all dynamic content
    clearAllContent();

    // Hide admin content only for non-admin users
    if (!currentUser || currentUser.role !== 'admin') {
        hideAllAdminContent();
    }

    // Reset any global variables
    window.availableUsers = null;
    availableDepartments = [];

    // Show default tab after reset (ensure something is visible)
    showTab('faxes', document.querySelector('.nav-tab[data-tab="faxes"]'));
}

function clearAllContent() {
    // Clear all dynamic content areas
    const contentAreas = [
        'faxesList',
        'workflowsList', 
        'usersList',
        'departmentsList',
        'uploadMessage',
        'workflowMessage',
        'addDepartmentMessage'
    ];
    
    contentAreas.forEach(areaId => {
        const element = document.getElementById(areaId);
        if (element) {
            element.innerHTML = '';
        }
    });
    
    // Reset forms
    const forms = [
        'uploadForm',
        'workflowForm',
        'addDepartmentForm'
    ];
    
    forms.forEach(formId => {
        const form = document.getElementById(formId);
        if (form) {
            form.reset();
        }
    });
    
    // Clear any error/success messages
    const messages = document.querySelectorAll('.error, .success');
    messages.forEach(msg => {
        msg.style.display = 'none';
        msg.textContent = '';
    });
}

function hideAllAdminContent() {
    // Hide only admin-related content areas and forms, not all tab contents
    const adminContentAreas = [
        'usersList',
        'departmentsList'
    ];

    adminContentAreas.forEach(areaId => {
        const element = document.getElementById(areaId);
        if (element) {
            element.style.display = 'none';
            element.innerHTML = '';
        }
    });

    // Hide admin forms
    const adminForms = [
        'addDepartmentForm'
    ];

    adminForms.forEach(formId => {
        const form = document.getElementById(formId);
        if (form) {
            form.style.display = 'none';
        }
    });

    // Hide admin warning messages
    const adminWarnings = document.querySelectorAll('.admin-warning');
    adminWarnings.forEach(warning => {
        warning.style.display = 'none';
    });
    // Do NOT hide all tab contents here
}

function resetTabState() {
    // Hide all tab contents first
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => content.classList.remove('active'));
    
    // Remove active class from all tabs
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    
    // Show default tab (faxes) and make it active
    const defaultTab = document.querySelector('.nav-tab[data-tab="faxes"]');
    const defaultContent = document.getElementById('faxes');
    if (defaultTab && defaultContent) {
        defaultTab.classList.add('active');
        defaultContent.classList.add('active');
    }
}

function updateNavVisibility() {
    const uploadTab = document.querySelector(".nav-tabs .nav-tab[data-tab='upload']");
    const uploadTabAlt = Array.from(document.querySelectorAll('.nav-tab')).find(b => b.textContent.includes('Upload'));
    const canUpload = currentUser && currentUser.role === 'faxes';
    const el = uploadTab || uploadTabAlt;
    if (el) {
        el.style.display = canUpload ? 'block' : 'none';
    }
    
    // Show/hide admin-only tabs
    const adminTabs = document.querySelectorAll('.admin-only');
    adminTabs.forEach(tab => {
        tab.style.display = currentUser && currentUser.role === 'admin' ? 'block' : 'none';
    });
}

// Tab navigation
function showTab(tabName, el) {
    // Security check for admin tabs
    if ((tabName === 'user-management' || tabName === 'department-management') &&
        (!currentUser || currentUser.role !== 'admin')) {
        console.warn('Unauthorized access attempt to admin tab:', tabName);
        return;
    }
    // Hide all tab contents and set display: none
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
    });
    // Remove active class from all tabs
    const navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach(tab => tab.classList.remove('active'));
    // Show the selected tab-content and set display: block
    var content = document.getElementById(tabName);
    if (content) {
        content.classList.add('active');
        content.style.display = 'block';
    }
    // Mark current tab as active
    if (el) { el.classList.add('active'); }
    // Load data for the selected tab
    switch(tabName) {
        case 'faxes':
            loadFaxes();
            break;
        case 'user-management':
            loadUsersForManagement();
            break;
        case 'department-management':
            loadDepartmentsForManagement();
            break;
    }
}

// Ensure tab switching works on initial load and after login
function activateDefaultTab() {
    const defaultTab = document.querySelector('.nav-tab[data-tab="faxes"]');
    const defaultContent = document.getElementById('faxes');
    if (defaultTab && defaultContent) {
        defaultTab.classList.add('active');
        defaultContent.classList.add('active');
    }
}

// Patch showMainApp to always activate the default tab
const _originalShowMainApp = showMainApp;
showMainApp = function() {
    _originalShowMainApp();
    activateDefaultTab();
};

document.addEventListener('DOMContentLoaded', function() {
    activateDefaultTab();
});

// Load initial data
async function loadInitialData() {
    // Always load departments for admin user management
    await loadDepartments();
    // Load users upfront only if manager (manages visibility)
    if (currentUser && currentUser.role === 'manager') {
        await loadUsers();
    }
    await loadFaxes();
}

// Fax functions
async function loadFaxes() {
    try {
        const response = await fetch('/api/faxes', {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (response.ok) {
            const faxes = await response.json();
            displayFaxes(faxes);
        } else {
            const faxesList = document.getElementById('faxesList');
            let data = null;
            try { data = await response.json(); } catch (_) {}
            if (faxesList) {
                faxesList.innerHTML = `<div class="error">Failed to load faxes: ${data && data.error ? data.error : response.status}</div>`;
            }
        }
    } catch (error) {
        console.error('Error loading faxes:', error);
        const faxesList = document.getElementById('faxesList');
        if (faxesList) {
            faxesList.innerHTML = `<div class="error">Network error while loading faxes</div>`;
        }
    }
}

function displayFaxes(faxes) {
    const faxesList = document.getElementById('faxesList');
    
    if (faxes.length === 0) {
        faxesList.innerHTML = '<div class="loading">No faxes found</div>';
        return;
    }
    
    faxesList.innerHTML = faxes.map(fax => {
        const assignedLabel = fax.assigned_department_name ? `Assigned to: ${fax.assigned_department_name}` : 'Unassigned';
        const isRestricted = (fax.permissions_count || 0) > 0;
        const visibilityLabel = isRestricted ? 'Restricted: Specific users only' : 'Visible to department';
        // Only managers can assign faxes (admins are explicitly excluded)
        const assignControl = ((currentUser && currentUser.role === 'manager') && availableDepartments.length)
            ? `
            <div style="margin-top:10px;">
                <label style="font-size:12px;color:#718096;">Assign to department</label>
                <div style="display:flex;gap:8px;">
                    <select id="assign-select-${fax.id}">
                        <option value="">Choose...</option>
                        ${availableDepartments.map(d => `<option value="${d.id}" ${fax.assigned_department_name===d.name?'selected':''}>${d.name}</option>`).join('')}
                    </select>
                    <button class="btn btn-secondary btn-sm" onclick="assignFaxDepartment(${fax.id})">Assign</button>
                </div>
            </div>`
            : '';
        const manageVisibility = (currentUser && currentUser.role === 'manager')
            ? `
            <div style="margin-top:10px;">
                <label style="font-size:12px;color:#718096;">Visibility</label>
                <div>
                    <span class="status-badge" style="background:${isRestricted?'#ebf8ff':'#f0fff4'}; color:${isRestricted?'#3182ce':'#38a169'};">${visibilityLabel}</span>
                </div>
                <div style="margin-top:8px;">
                    <button class="btn btn-secondary btn-sm" onclick="toggleVisibilityPanel(${fax.id})">Manage visibility</button>
                </div>
                <div id="vis-panel-${fax.id}" style="display:none; margin-top:10px; padding:10px; border:1px solid #e2e8f0; border-radius:8px;">
                    <div id="vis-users-${fax.id}" class="signer-list" style="max-height:200px; overflow:auto;">
                        <div class="loading">Loading users...</div>
                    </div>
                    <div style="margin-top:10px; display:flex; gap:8px;">
                        <button class="btn btn-sm" onclick="saveFaxVisibility(${fax.id})">Save</button>
                        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('vis-panel-${fax.id}').style.display='none'">Cancel</button>
                    </div>
                </div>
            </div>`
            : '';
        const hasExplicit = Number(fax.permissions_count || 0) > 0;
        const sameDept = fax.assigned_department_id === (currentUser && currentUser.department_id);
        const allowedByVisibility = hasExplicit ? !!fax.is_permitted : sameDept;
        const statusLower = String(fax.status).toLowerCase();
        const canChange = statusLower === 'pending';
        const statusIcon = statusLower === 'pending'
            ? '<i class="fas fa-hourglass-half" aria-hidden="true"></i>'
            : (statusLower === 'confirmed' ? '<i class="fas fa-check-circle" aria-hidden="true"></i>' : '');
        const statusAction = canChange
            ? `<button class="btn btn-confirm btn-sm" style="margin-left:8px" onclick="updateFaxStatus(${fax.id}, 'confirmed')"><i class="fas fa-check"></i> Confirm</button>`
            : '';
        return `
        <div class="card">
            <h3>Fax from ${fax.sender_name}</h3>
            <p><strong>Fax Number:</strong> ${fax.fax_number}</p>
            <p><strong>Received:</strong> ${new Date(fax.received_date).toLocaleDateString()}</p>
            <p><strong>Uploaded by:</strong> ${fax.uploaded_by_name}</p>
            <p><strong>${assignedLabel}</strong></p>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span id="fax-status-${fax.id}" class="status-badge status-${statusLower}">${statusIcon}<span style="margin-left:6px;">${statusLower}</span></span>
                ${statusAction}
            </div>
            <div id="fax-preview-${fax.id}" class="fax-preview" style="margin-top:12px; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; background:#f8fafc; display:flex; align-items:center; justify-content:center; cursor:pointer;" onclick="maximizeFax(${fax.id})">
                <div style="padding:16px; color:#718096; font-size:14px;">Loading preview...</div>
            </div>
            ${assignControl}
            ${manageVisibility}

            <div class="comments">
                <div class="comments-header">
                    <div class="comments-title">
                        <i class="fas fa-comments" style="color:#667eea;"></i>
                        <span>Comments</span>
                        <span id="comments-count-${fax.id}" class="comments-count">${Number(fax.comments_count || 0)}</span>
                    </div>
                    <button class="btn btn-ghost btn-sm comments-toggle" id="comments-toggle-${fax.id}" onclick="toggleFaxComments(${fax.id})">Show</button>
                </div>
                <div id="comments-section-${fax.id}" class="comments-body" style="display:none;">
                    <div id="comments-list-${fax.id}" class="comments-list">
                        <div class="comment-empty">No comments yet</div>
                    </div>
                    <div class="comment-actions">
                        <input id="comment-input-${fax.id}" class="input" type="text" maxlength="2000" placeholder="Add a comment..." />
                        <button class="btn btn-sm" id="comment-btn-${fax.id}" onclick="addFaxComment(${fax.id})">Add</button>
                    </div>
                    <div id="comment-msg-${fax.id}" class="comment-empty" style="display:none;"></div>
                </div>
            </div>
        </div>`;
    }).join('');

    // After rendering cards, load previews
    faxes.forEach(f => loadFaxPreview(f.id));
}

// Update fax status (pending -> confirmed) for privileged users
async function updateFaxStatus(faxId, newStatus) {
    const btn = event && event.target ? event.target : null;
    if (btn) btn.disabled = true;
    try {
        const res = await fetch(`/api/faxes/${faxId}/status`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ status: newStatus })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            alert(data.error || 'Failed to update status');
            return;
        }
        // Refresh the list to reflect status change and any derived UI
        await loadFaxes();
    } catch (e) {
        alert('Network error while updating status');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// Toggle and load comments for a fax
async function toggleFaxComments(faxId) {
    const sec = document.getElementById(`comments-section-${faxId}`);
    const btn = document.getElementById(`comments-toggle-${faxId}`);
    if (!sec) return;
    const willShow = (sec.style.display === 'none' || sec.style.display === '');
    if (willShow) {
        sec.style.display = 'block';
        await loadFaxComments(faxId);
        if (btn) btn.textContent = 'Hide';
    } else {
        sec.style.display = 'none';
        if (btn) btn.textContent = 'Show';
    }
}

// Safely compute initials from a display name (supports single or multi-word names)
function getInitials(name) {
    const s = (name || '').toString().trim();
    if (!s) return '?';
    const parts = s.split(/\s+/).filter(Boolean);
    const letters = [];
    for (const p of parts) {
        if (p && p[0]) letters.push(p[0]);
        if (letters.length >= 2) break;
    }
    if (letters.length === 0 && s[0]) letters.push(s[0]);
    if (letters.length === 1) {
        const compact = s.replace(/\s+/g, '');
        if (compact.length > 1) letters.push(compact[1]);
    }
    return letters.join('').toUpperCase();
}

async function loadFaxComments(faxId) {
    const list = document.getElementById(`comments-list-${faxId}`);
    if (!list) return;
    list.innerHTML = '<div class="comment-loading">Loading comments...</div>';
    try {
        const res = await fetch(`/api/faxes/${faxId}/comments`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        if (!res.ok) {
            let serverMsg = '';
            try {
                const data = await res.json();
                serverMsg = data && (data.error || data.message) ? `${data.error || data.message}` : '';
            } catch (_) {
                try { serverMsg = await res.text(); } catch (_) { /* noop */ }
            }
            const msg = `Failed to load comments${res.status ? ` (HTTP ${res.status})` : ''}${serverMsg ? `: ${serverMsg}` : ''}`;
            console.error('[comments] load failed', { faxId, status: res.status, serverMsg });
            list.innerHTML = `<div class="comment-error">${msg}</div>`;
            return;
        }
        const comments = await res.json();
        if (!Array.isArray(comments)) {
            console.error('[comments] unexpected payload', comments);
            list.innerHTML = '<div class="comment-error">Failed to load comments: invalid server response</div>';
            return;
        }
        if (comments.length === 0) {
            list.innerHTML = '<div class="comment-empty">No comments yet</div>';
            updateCommentsCount(faxId, 0);
            return;
        }
        try {
            const html = comments.map(c => {
                const dateStr = new Date(c.created_at).toLocaleString();
                const safeText = (c.comment || '').replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));
                const name = c.user_name || ('User ' + c.user_id);
                const initials = getInitials(name);
                return `<div class=\"comment-item\">\n                    <div class=\"comment-avatar\">${initials}</div>\n                    <div style=\"flex:1;\">\n                        <div class=\"comment-meta\">${name}<span class=\"comment-date\">${dateStr}</span></div>\n                        <div class=\"comment-text\">${safeText}</div>\n                    </div>\n                </div>`;
            }).join('');
            list.innerHTML = html;
            updateCommentsCount(faxId, comments.length);
            console.debug('[comments] loaded', { faxId, count: comments.length });
        } catch (renderErr) {
            console.error('[comments] render error', renderErr);
            list.innerHTML = `<div class=\"comment-error\">Failed to render comments: ${renderErr && renderErr.message ? renderErr.message : 'unknown error'}</div>`;
        }
    } catch (e) {
        console.error('[comments] load exception', e);
        const msg = (e && e.message) ? `Failed to load comments: ${e.message}` : 'Failed to load comments';
        list.innerHTML = `<div class="comment-error">${msg}</div>`;
    }
}

async function addFaxComment(faxId) {
    const input = document.getElementById(`comment-input-${faxId}`);
    const btn = document.getElementById(`comment-btn-${faxId}`);
    const msg = document.getElementById(`comment-msg-${faxId}`);
    if (!input || !btn) return;
    const text = (input.value || '').trim();
    if (!text) {
        if (msg) { msg.style.display = 'block'; msg.className = 'comment-error'; msg.textContent = 'Comment cannot be empty.'; }
        return;
    }
    btn.disabled = true;
    if (msg) { msg.style.display = 'none'; msg.textContent = ''; }
    try {
        const res = await fetch(`/api/faxes/${faxId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
            body: JSON.stringify({ comment: text })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            if (msg) { msg.style.display = 'block'; msg.className = 'comment-error'; msg.textContent = data.error || 'Failed to add comment'; }
            return;
        }
        input.value = '';
        if (msg) { msg.style.display = 'block'; msg.className = 'comment-success'; msg.textContent = 'Comment added.'; }
        await loadFaxComments(faxId);
    } catch (e) {
        if (msg) { msg.style.display = 'block'; msg.className = 'comment-error'; msg.textContent = 'Network error.'; }
    } finally {
        btn.disabled = false;
    }
}

function updateCommentsCount(faxId, count) {
    const el = document.getElementById(`comments-count-${faxId}`);
    if (el) el.textContent = String(count);
}

// Manage visibility panel logic (admin/manager)
async function toggleVisibilityPanel(faxId) {
    const panel = document.getElementById(`vis-panel-${faxId}`);
    const usersBox = document.getElementById(`vis-users-${faxId}`);
    if (!panel || !usersBox) return;
    const willShow = panel.style.display === 'none' || panel.style.display === '';
    if (willShow) {
        // Ensure users are loaded
        if (!window.availableUsers) {
            await loadUsers();
        }
        // Fetch current permissions
        let permitted = [];
        try {
            const res = await fetch(`/api/faxes/${faxId}/permissions`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
            if (res.ok) {
                permitted = await res.json();
            }
        } catch (e) { /* ignore */ }
        renderVisibilityPanel(faxId, permitted.map(u => u.id));
        panel.style.display = 'block';
    } else {
        panel.style.display = 'none';
    }
}

function renderVisibilityPanel(faxId, permittedIds) {
    const usersBox = document.getElementById(`vis-users-${faxId}`);
    if (!usersBox) return;
    const users = (window.availableUsers || []).filter(u => u.role !== 'admin' && u.role !== 'manager');
    if (!users.length) {
        usersBox.innerHTML = '<div class="loading">No users to select</div>';
        return;
    }
    usersBox.innerHTML = users.map(u => {
        const checked = permittedIds && permittedIds.includes(u.id) ? 'checked' : '';
        return `
            <label style="display:flex; align-items:center; gap:8px; padding:6px 0;">
                <input type="checkbox" class="vis-user-${faxId}" value="${u.id}" ${checked} />
                <span>${u.full_name} <span style="color:#718096; font-size:12px;">(${u.email})</span></span>
            </label>
        `;
    }).join('');
}

async function saveFaxVisibility(faxId) {
    const checkboxes = Array.from(document.querySelectorAll(`.vis-user-${faxId}`));
    const selected = checkboxes.filter(cb => cb.checked).map(cb => parseInt(cb.value));
    try {
        const res = await fetch(`/api/faxes/${faxId}/permissions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
            body: JSON.stringify({ user_ids: selected })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            alert(data.error || 'Failed to save visibility');
            return;
        }
        // Refresh list to update badge
        await loadFaxes();
    } catch (e) {
        alert('Failed to save visibility');
    }
}

async function handleUpload(e) {
    e.preventDefault();

    const faxNumber = document.getElementById('faxNumber').value;
    const senderName = document.getElementById('senderName').value;
    const faxFileInput = document.getElementById('faxFile');
    const faxFile = faxFileInput.files[0];

    // Check if file is selected
    if (!faxFile) {
        showMessage('uploadMessage', 'Please select a fax file to upload.', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('fax_number', faxNumber);
    formData.append('sender_name', senderName);
    formData.append('fax', faxFile);

    try {
        // Use the correct endpoint (likely /api/faxes)
        const response = await fetch('/api/faxes/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentToken}`
            },
            body: formData
        });

        let data;
        try {
            data = await response.json();
        } catch (jsonErr) {
            data = { error: 'Unexpected server response.' };
        }

        console.log('Upload response:', response, data); // Debug log

        if (response.ok) {
            showMessage('uploadMessage', 'Fax uploaded successfully!', 'success');
            document.getElementById('uploadForm').reset();
            loadFaxes();
        } else {
            showMessage('uploadMessage', data.error || 'Upload failed. Please try again.', 'error');
        }
    } catch (error) {
        console.error('Upload error:', error);
        showMessage('uploadMessage', 'Upload failed. Please try again.', 'error');
    }
}


function handleFileSelect(e) {
    const file = e.target.files[0];
    const fileNameSpan = document.getElementById('selectedFileName');
    if (file && fileNameSpan) {
        fileNameSpan.textContent = `Selected: ${file.name}`;
    } else if (fileNameSpan) {
        fileNameSpan.textContent = '';
    }
}

// Workflow functions
async function loadWorkflows() {
    try {
        const response = await fetch('/api/workflows', {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (response.ok) {
            const workflows = await response.json();
            displayWorkflows(workflows);
        }
    } catch (error) {
        console.error('Error loading workflows:', error);
    }
}

function displayWorkflows(workflows) {
    const workflowsList = document.getElementById('workflowsList');
    
    if (workflows.length === 0) {
        workflowsList.innerHTML = '<div class="loading">No workflows found</div>';
        return;
    }
    
    workflowsList.innerHTML = workflows.map(workflow => `
        <div class="card">
            <h3>${workflow.workflow_name}</h3>
            <p><strong>Fax:</strong> ${workflow.fax_number} (${workflow.sender_name})</p>
            <p><strong>Created by:</strong> ${workflow.created_by_name}</p>
            <p><strong>Created:</strong> ${new Date(workflow.created_at).toLocaleDateString()}</p>
            <span class="status-badge status-${workflow.status}">${workflow.status}</span>
            <button class="btn" onclick="viewWorkflowDetails(${workflow.id})">View Details</button>
        </div>
    `).join('');
}

async function viewWorkflowDetails(workflowId) {
    try {
        const response = await fetch(`/api/workflows/${workflowId}`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (response.ok) {
            const workflow = await response.json();
            displayWorkflowDetails(workflow);
        }
    } catch (error) {
        console.error('Error loading workflow details:', error);
    }
}

function displayWorkflowDetails(workflow) {
    const workflowsList = document.getElementById('workflowsList');
    
    const signersHtml = workflow.signers.map(signer => `
        <div class="signer-item">
            <span>${signer.name} (${signer.email})</span>
            <span class="status-badge status-${signer.status}">${signer.status}</span>
            ${signer.status === 'pending' && signer.user_id === currentUser.id ? 
                `<button class="btn" onclick="openSignatureModal(${workflow.id})">Sign Now</button>` : ''}
        </div>
    `).join('');
    
    workflowsList.innerHTML = `
        <div class="card">
            <h3>${workflow.workflow_name}</h3>
            <p><strong>Fax:</strong> ${workflow.fax_number} (${workflow.sender_name})</p>
            <p><strong>Created by:</strong> ${workflow.created_by_name}</p>
            <p><strong>Created:</strong> ${new Date(workflow.created_at).toLocaleDateString()}</p>
            <h4>Signers:</h4>
            ${signersHtml}
            <button class="btn btn-secondary" onclick="loadWorkflows()">Back to Workflows</button>
        </div>
    `;
}

async function loadFaxesForWorkflow() {
    try {
        const response = await fetch('/api/faxes', {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (response.ok) {
            const faxes = await response.json();
            const select = document.getElementById('workflowFax');
            select.innerHTML = '<option value="">Choose a fax...</option>';
            faxes.forEach(fax => {
                select.innerHTML += `<option value="${fax.id}">${fax.sender_name} - ${fax.fax_number}</option>`;
            });
        }
    } catch (error) {
        console.error('Error loading faxes for workflow:', error);
    }
}

async function loadUsers() {
    try {
        const url = (currentUser && currentUser.role === 'manager') ? '/api/users/basic' : '/api/users';
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (response.ok) {
            const users = await response.json();
            window.availableUsers = users;
        }
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

async function loadDepartments() {
    try {
        const response = await fetch('/api/departments', {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        if (response.ok) {
            availableDepartments = await response.json();
        }
    } catch (e) {
        console.error('Error loading departments:', e);
    }
}

async function assignFaxDepartment(faxId) {
    // Frontend guard: only managers can assign faxes
    if (!currentUser || currentUser.role !== 'manager') {
        alert('Only managers can assign faxes');
        return;
    }
    const select = document.getElementById(`assign-select-${faxId}`);
    if (!select || !select.value) {
        alert('Please choose a department');
        return;
    }
    try {
        const response = await fetch(`/api/faxes/${faxId}/assign-department`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ department_id: parseInt(select.value) })
        });
        const data = await response.json();
        if (response.ok) {
            loadFaxes();
        } else {
            alert(data.error || 'Failed to assign');
        }
    } catch (e) {
        alert('Failed to assign department');
    }
}

function addSigner() {
    const signersList = document.getElementById('signersList');
    const signerCount = signersList.children.length;
    
    const signerDiv = document.createElement('div');
    signerDiv.className = 'signer-item';
    signerDiv.innerHTML = `
        <select class="signer-user" required>
            <option value="">Select user...</option>
            ${window.availableUsers ? window.availableUsers.map(user => 
                `<option value="${user.id}" data-email="${user.email}" data-name="${user.full_name}">${user.full_name}</option>`
            ).join('') : ''}
        </select>
        <button type="button" class="btn btn-secondary" onclick="this.parentElement.remove()">Remove</button>
    `;
    
    signersList.appendChild(signerDiv);
}

async function handleCreateWorkflow(e) {
    e.preventDefault();
    
    const faxId = document.getElementById('workflowFax').value;
    const workflowName = document.getElementById('workflowName').value;
    const signerElements = document.querySelectorAll('.signer-user');
    
    const signers = Array.from(signerElements).map((element, index) => {
        const selectedOption = element.options[element.selectedIndex];
        return {
            user_id: parseInt(element.value),
            email: selectedOption.dataset.email,
            name: selectedOption.dataset.name
        };
    }).filter(signer => signer.user_id);
    
    if (signers.length === 0) {
        showMessage('workflowMessage', 'Please add at least one signer.', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/workflows', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({
                fax_id: parseInt(faxId),
                workflow_name: workflowName,
                signers: signers
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showMessage('workflowMessage', 'Workflow created successfully!', 'success');
            document.getElementById('workflowForm').reset();
            document.getElementById('signersList').innerHTML = '';
            loadWorkflows();
        } else {
            showMessage('workflowMessage', data.error, 'error');
        }
    } catch (error) {
        showMessage('workflowMessage', 'Failed to create workflow. Please try again.', 'error');
    }
}

// Signature functions
function openSignatureModal(workflowId) {
    currentWorkflowId = workflowId;
    document.getElementById('signatureModal').style.display = 'block';
    clearSignature();
}

function closeSignatureModal() {
    document.getElementById('signatureModal').style.display = 'none';
    currentWorkflowId = null;
}

// Fax Viewer
let currentFaxObjectUrl = null;
let modalOwnsUrl = false; // true if the modal created the object URL and should revoke it
let faxStatusTimeout = null;

function setFaxViewerStatus(text = 'Loading...', show = true) {
    const s = document.getElementById('faxViewerStatus');
    if (!s) return;
    if (show) {
        s.textContent = text;
        s.style.display = 'block';
    } else {
        s.style.display = 'none';
    }
}
async function viewFax(faxId) {
    try {
        const res = await fetch(`/api/faxes/${faxId}/file`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.error('Open fax failed', { status: res.status, statusText: res.statusText, err });
            alert(err.error || 'Failed to open fax');
            return;
        }
        const blob = await res.blob();
        // Revoke previous URL if we own it
        if (currentFaxObjectUrl && modalOwnsUrl) {
            URL.revokeObjectURL(currentFaxObjectUrl);
        }
        currentFaxObjectUrl = URL.createObjectURL(blob);
        modalOwnsUrl = true;

        const frame = document.getElementById('faxViewerFrame');
        const img = document.getElementById('faxViewerImage');

        const modal = document.getElementById('faxViewerModal');

        // Reset both views
        frame.style.display = 'none';
        frame.src = 'about:blank';
        img.style.display = 'none';
        img.removeAttribute('src');

        // Force using iframe for reliability across types
        setFaxViewerStatus('Loading...', true);
        // Clear previous onload listener
        frame.onload = () => {
            setFaxViewerStatus('', false);
            if (faxStatusTimeout) { clearTimeout(faxStatusTimeout); faxStatusTimeout = null; }
        };
        frame.src = currentFaxObjectUrl;
        frame.style.display = 'block';
        img.style.display = 'none';
        img.removeAttribute('src');

        // Now show the modal after content is set
        modal.style.display = 'block';

        // Safety timeout to keep user informed
        if (faxStatusTimeout) clearTimeout(faxStatusTimeout);
        faxStatusTimeout = setTimeout(() => {
            setFaxViewerStatus('Still loading...', true);
        }, 3000);
    } catch (e) {
        try { document.getElementById('faxViewerModal').style.display = 'none'; } catch {}
        console.error('Exception opening fax', e);
        alert('Failed to open fax');
    }
}

function closeFaxViewer() {
    const modal = document.getElementById('faxViewerModal');
    const frame = document.getElementById('faxViewerFrame');
    const img = document.getElementById('faxViewerImage');
    modal.style.display = 'none';
    setFaxViewerStatus('', false);
    if (faxStatusTimeout) { clearTimeout(faxStatusTimeout); faxStatusTimeout = null; }
    frame.src = 'about:blank';
    frame.style.display = 'none';
    if (img) {
        img.removeAttribute('src');
        img.style.display = 'none';
    }
    if (currentFaxObjectUrl && modalOwnsUrl) {
        URL.revokeObjectURL(currentFaxObjectUrl);
    }
    currentFaxObjectUrl = null;
    modalOwnsUrl = false;
}

function startDrawing(e) {
    isDrawing = true;
    draw(e);
}

function draw(e) {
    if (!isDrawing) return;
    
    const rect = signatureCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    signatureContext.lineWidth = 2;
    signatureContext.lineCap = 'round';
    signatureContext.strokeStyle = '#000';
    
    signatureContext.lineTo(x, y);
    signatureContext.stroke();
    signatureContext.beginPath();
    signatureContext.moveTo(x, y);
}

function stopDrawing() {
    isDrawing = false;
    signatureContext.beginPath();
}

function handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    signatureCanvas.dispatchEvent(mouseEvent);
}

function handleTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    signatureCanvas.dispatchEvent(mouseEvent);
}

function clearSignature() {
    signatureContext.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
}

async function submitSignature() {
    const signatureData = signatureCanvas.toDataURL();
    
    try {
        const response = await fetch(`/api/sign/${currentWorkflowId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({
                signature_data: signatureData
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            closeSignatureModal();
            loadWorkflows();
            alert('Document signed successfully!');
        } else {
            alert(data.error);
        }
    } catch (error) {
        alert('Failed to submit signature. Please try again.');
    }
}

// User Management Functions (Admin Only)
async function loadUsersForManagement() {
    try {
        const response = await fetch('/api/users', {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (response.ok) {
            const users = await response.json();
            displayUsersForManagement(users);
        } else {
            console.error('Failed to load users');
        }
    } catch (error) {
        console.error('Error loading users for management:', error);
    }
}

function displayUsersForManagement(users) {
    const usersList = document.getElementById('usersList');
    if (usersList) {
        usersList.style.display = 'block';
    }
    
    if (users.length === 0) {
        usersList.innerHTML = '<div class="loading">No users found</div>';
        return;
    }
    
    usersList.innerHTML = users.map(user => {
        const isCurrentUser = user.id === currentUser.id;
        const roleOptions = ['user', 'manager', 'admin', 'faxes'].map(role => 
            `<option value="${role}" ${user.role === role ? 'selected' : ''}>${role}</option>`
        ).join('');
        
        const departmentOptions = availableDepartments.map(dept => 
            `<option value="${dept.id}" ${user.department_id === dept.id ? 'selected' : ''}>${dept.name}</option>`
        ).join('');
        
        return `
        <div class="user-card">
            <div class="user-header">
                <div class="user-info">
                    <div class="user-name">${user.full_name}</div>
                    <div class="user-details">
                        <strong>Username:</strong> ${user.username} | 
                        <strong>Email:</strong> ${user.email} | 
                        <strong>Current Role:</strong> 
                        <span class="role-badge role-${user.role}">${user.role}</span>
                    </div>
                </div>
                <div class="role-selector">
                    <div style="display: flex; flex-direction: column; gap: 8px; align-items: flex-end;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <label style="font-size: 12px; color: #718096;">Role:</label>
                            <select id="role-select-${user.id}" ${isCurrentUser ? 'disabled' : ''}>
                                ${roleOptions}
                            </select>
                            <button 
                                class="update-btn" 
                                onclick="updateUserRole(${user.id})" 
                                ${isCurrentUser ? 'disabled' : ''}
                                title="${isCurrentUser ? 'Cannot modify your own role' : 'Update user role'}"
                            >
                                ${isCurrentUser ? 'Current User' : 'Update Role'}
                            </button>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <label style="font-size: 12px; color: #718096;">Department:</label>
                            <select id="dept-select-${user.id}">
                                <option value="">No Department</option>
                                ${departmentOptions}
                            </select>
                            <button 
                                class="update-btn" 
                                onclick="updateUserDepartment(${user.id})" 
                                title="Update user department"
                            >
                                Update Department
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
}

async function updateUserRole(userId) {
    const roleSelect = document.getElementById(`role-select-${userId}`);
    const newRole = roleSelect.value;
    
    try {
        const response = await fetch(`/api/users/${userId}/role`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ role: newRole })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Show success message
            showMessage('usersList', `Role updated successfully for user ID ${userId}`, 'success');
            
            // Reload users to reflect changes
            setTimeout(() => {
                loadUsersForManagement();
            }, 1000);
        } else {
            // Show error message
            showMessage('usersList', data.error || 'Failed to update role', 'error');
        }
    } catch (error) {
        showMessage('usersList', 'Network error. Please try again.', 'error');
    }
}

async function updateUserDepartment(userId) {
    const deptSelect = document.getElementById(`dept-select-${userId}`);
    const newDepartmentId = deptSelect.value;
    
    try {
        const response = await fetch(`/api/users/${userId}/department`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ department_id: newDepartmentId ? parseInt(newDepartmentId) : null })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Show success message
            const deptName = newDepartmentId ? availableDepartments.find(d => d.id === parseInt(newDepartmentId))?.name : 'No Department';
            showMessage('usersList', `Department updated successfully for user ID ${userId} to ${deptName}`, 'success');
            
            // Reload users to reflect changes
            setTimeout(() => {
                loadUsersForManagement();
            }, 1000);
        } else {
            // Show error message
            showMessage('usersList', data.error || 'Failed to update department', 'error');
        }
    } catch (error) {
        showMessage('usersList', 'Network error. Please try again.', 'error');
    }
}

// Department Management Functions (Admin Only)
async function loadDepartmentsForManagement() {
    try {
        // Ensure admin form is visible when managing departments
        const addForm = document.getElementById('addDepartmentForm');
        if (addForm) {
            addForm.style.display = 'block';
        }
        const response = await fetch('/api/departments', {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (response.ok) {
            const departments = await response.json();
            displayDepartmentsForManagement(departments);
        } else {
            console.error('Failed to load departments');
        }
    } catch (error) {
        console.error('Error loading departments for management:', error);
    }
}

function displayDepartmentsForManagement(departments) {
    const departmentsList = document.getElementById('departmentsList');
    if (departmentsList) {
        departmentsList.style.display = 'block';
    }

    if (departments.length === 0) {
        departmentsList.innerHTML = '<div class="loading">No departments found</div>';
        return;
    }
    
    departmentsList.innerHTML = departments.map(dept => `
        <div class="department-card">
            <div class="department-header">
                <div>
                    <div class="department-name">${dept.name}</div>
                    <div class="user-count">ID: ${dept.id}</div>
                </div>
                <div class="department-actions">
                    <button type="button" class="edit-btn" onclick="toggleEditDepartment(${dept.id}, '${dept.name}')">Edit</button>
                    <button type="button" class="delete-btn" onclick="deleteDepartment(${dept.id}, '${dept.name}')">Delete</button>
                </div>
            </div>
            <div id="edit-form-${dept.id}" class="edit-form">
                <input type="text" id="edit-dept-${dept.id}" value="${dept.name}" placeholder="Department name" onkeydown="if(event.key==='Enter'){ event.preventDefault(); updateDepartment(${dept.id}); }">
                <button type="button" class="btn btn-sm" onclick="updateDepartment(${dept.id})">Save</button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="toggleEditDepartment(${dept.id})">Cancel</button>
            </div>
        </div>
    `).join('');
}

function toggleEditDepartment(deptId, currentName = null) {
    const editForm = document.getElementById(`edit-form-${deptId}`);
    const editInput = document.getElementById(`edit-dept-${deptId}`);
    
    if (editForm.classList.contains('active')) {
        editForm.classList.remove('active');
        if (currentName) {
            editInput.value = currentName;
        }
    } else {
        editForm.classList.add('active');
        editInput.focus();
    }
}

async function updateDepartment(deptId) {
    const newName = document.getElementById(`edit-dept-${deptId}`).value.trim();
    
    if (!newName) {
        showMessage('departmentsMessage', 'Department name cannot be empty', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/departments/${deptId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ name: newName })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showMessage('departmentsMessage', 'Department updated successfully', 'success');
            toggleEditDepartment(deptId);
            loadDepartmentsForManagement();
            // Also reload departments for other parts of the app
            await loadDepartments();
        } else {
            showMessage('departmentsMessage', data.error || 'Failed to update department', 'error');
        }
    } catch (error) {
        showMessage('departmentsMessage', 'Network error. Please try again.', 'error');
    }
}

async function deleteDepartment(deptId, deptName) {
    if (!confirm(`Are you sure you want to delete the department "${deptName}"? This action cannot be undone.`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/departments/${deptId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showMessage('departmentsMessage', 'Department deleted successfully', 'success');
            loadDepartmentsForManagement();
            // Also reload departments for other parts of the app
            await loadDepartments();
        } else {
            showMessage('departmentsMessage', data.error || 'Failed to delete department', 'error');
        }
    } catch (error) {
        showMessage('departmentsMessage', 'Network error. Please try again.', 'error');
    }
}

async function handleAddDepartment(e) {
    e.preventDefault();
    
    const deptName = document.getElementById('newDepartmentName').value.trim();
    
    if (!deptName) {
        showMessage('addDepartmentMessage', 'Department name is required', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/departments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ name: deptName })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showMessage('addDepartmentMessage', 'Department created successfully', 'success');
            document.getElementById('addDepartmentForm').reset();
            loadDepartmentsForManagement();
            // Also reload departments for other parts of the app
            await loadDepartments();
        } else {
            showMessage('addDepartmentMessage', data.error || 'Failed to create department', 'error');
        }
    } catch (error) {
        showMessage('addDepartmentMessage', 'Network error. Please try again.', 'error');
    }
}

// Utility functions
function showMessage(elementId, message, type) {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.className = type;
    element.style.display = 'block';
    
    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}

