document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const newNoteBtn = document.getElementById('new-note-btn');
    const noteCreator = document.getElementById('note-creator');
    const saveNoteBtn = document.getElementById('save-note-btn');
    const cancelNoteBtn = document.getElementById('cancel-note-btn');
    const noteTitleInput = document.getElementById('note-title-input');
    const noteContentInput = document.getElementById('note-content-input');
    const noteTagsInput = document.getElementById('note-tags-input');
    const notesList = document.getElementById('notes-list');
    const notesPlaceholder = document.getElementById('notes-placeholder');
    const noteActions = document.getElementById('note-actions');
    const welcomeMessage = document.querySelector('.welcome');
    const notesHeader = document.querySelector('.notes-header');

    // Elements for the new auto-delete feature
    const toggleTimersBtn = document.getElementById('toggle-timers-btn');
    const sortOptions = document.getElementById('sort-options');

    // --- State Variables ---
    let notes = JSON.parse(localStorage.getItem('notes')) || [];
    let currentFilterTag = null; // To track the active tag filter
    let currentStatusFilter = 'active'; // 'active', 'archived', or 'all'
    let currentSortOrder = 'modified-desc'; // Default sort order
    let showDeletionTimers = false; // To track visibility of timers
    let warnedNoteIds = new Set(); // Tracks notes that have received an expiration warning
    let mainTimerInterval; // To hold the main interval
    const NOTE_LIFESPAN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
    const NOTIFICATION_WARNING_MS = 5 * 60 * 1000; // 5 minutes before expiration

    // --- Main View Update Function ---
    const updateView = () => {
        sortOptions.value = currentSortOrder; // Sync dropdown with state
        renderStatusFilters();
        renderTagFilters();
        renderNotes();
    };

    // --- Core Note Functions ---

    // Renders the status filter buttons (Active, Archived, All)
    const renderStatusFilters = () => {
        const statusContainer = document.getElementById('status-filter-container');
        statusContainer.innerHTML = ''; // Clear existing buttons

        const statuses = [
            { key: 'active', text: 'Active Notes' },
            { key: 'archived', text: 'Archived' },
            { key: 'all', text: 'All Notes' }
        ];

        statuses.forEach(status => {
            const button = document.createElement('button');
            button.textContent = status.text;
            button.dataset.status = status.key;
            button.classList.add('status-filter-btn');
            if (status.key === currentStatusFilter) {
                button.classList.add('active');
            }
            button.addEventListener('click', () => {
                currentStatusFilter = status.key;
                updateView();
            });
            statusContainer.appendChild(button);
        });
    };

    // Renders the tag filter buttons based on all unique tags in the notes
    const renderTagFilters = () => {
        const tagFilterContainer = document.getElementById('tag-filter-container');
        const allTags = new Set(notes.flatMap(note => note.tags || []));

        tagFilterContainer.innerHTML = ''; // Clear existing filters
        if (allTags.size > 0) {
            const allButton = document.createElement('button');
            allButton.textContent = 'All Notes';
            allButton.classList.add('tag-filter-btn', currentFilterTag === null ? 'active' : null);
            allButton.addEventListener('click', () => {
                currentFilterTag = null;
                updateView();
            });
            tagFilterContainer.appendChild(allButton);

            allTags.forEach(tag => {
                const button = document.createElement('button');
                button.textContent = tag;
                button.classList.add('tag-filter-btn', tag === currentFilterTag ? 'active' : null);
                button.dataset.tag = tag;
                button.addEventListener('click', () => {
                    currentFilterTag = tag;
                    updateView();
                });
                tagFilterContainer.appendChild(button);
            });
        }
    };

    // Renders notes from the 'notes' array to the page
    const renderNotes = () => {
        notesList.innerHTML = ''; // Clear current list

        // 1. Filter notes by status (active, archived, all)
        let notesToRender = notes.filter(note => {
            if (currentStatusFilter === 'active') {
                return !note.isArchived;
            }
            if (currentStatusFilter === 'archived') {
                return note.isArchived;
            }
            return true; // 'all'
        });

        // 2. Further filter by the selected tag
        if (currentFilterTag) {
            notesToRender = notesToRender.filter(note => (note.tags || []).includes(currentFilterTag));
        }

        // 3. Sort the filtered notes based on the current sort order
        // We sort a *copy* to avoid changing the original array order, which is important for auto-delete
        const sortedNotes = [...notesToRender].sort((a, b) => {
            switch (currentSortOrder) {
                case 'created-asc':
                    return a.id - b.id;
                case 'created-desc':
                    return b.id - a.id;
                case 'title-asc':
                    return a.title.localeCompare(b.title);
                case 'title-desc':
                    return b.title.localeCompare(a.title);
                case 'modified-desc':
                default:
                    return b.modified - a.modified;
            }
        });

        // 4. Render the sorted notes
        if (sortedNotes.length === 0) {
            notesList.appendChild(notesPlaceholder);
            notesPlaceholder.style.display = 'block';
        } else {
            notesPlaceholder.style.display = 'none';
            sortedNotes.forEach(note => {
                const noteEl = document.createElement('div');
                noteEl.classList.add('saved-note');
                noteEl.classList.toggle('archived', !!note.isArchived);
                noteEl.dataset.id = note.id;

                // Build the metadata string to include a 'modified' timestamp if available
                let metaHTML = `Created: ${new Date(note.id).toLocaleString()}`;
                // Show 'Modified' if it's different from the creation time (with a small buffer for save-time)
                if (note.modified && note.modified > note.id + 1000) {
                    metaHTML += `<br>Modified: ${new Date(note.modified).toLocaleString()}`;
                }

                const tagsHTML = (note.tags || [])
                    .map(tag => `<span class="note-tag">${tag}</span>`)
                    .join('');

                // The timer is not relevant for archived notes
                const timerDisplayClass = showDeletionTimers && !note.isArchived ? '' : 'hidden';

                // Container for the deletion timer, visibility controlled by a class
                const timerContainerHTML = `
                    <div class="note-deletion-timer-container ${timerDisplayClass}">
                        <span class="timer-label">Deletes in:</span>
                        <span class="note-deletion-timer" data-deletion-time="${note.deletionTime}">--:--:--</span>
                    </div>`;
                const archiveBtnText = note.isArchived ? 'Unarchive' : 'Archive';

                noteEl.innerHTML = `
                    <h3>${note.title}</h3>
                    <p>${note.content}</p>
                    <div class="note-tags">${tagsHTML}</div>
                    <div class="saved-note-footer">
                        <span class="saved-note-meta">${metaHTML}</span>
                        <div class="saved-note-actions">
                            <button class="archive-note-btn" data-id="${note.id}">${archiveBtnText}</button>
                            <button class="edit-note-btn" data-id="${note.id}">Edit</button>
                            <button class="delete-note-btn" data-id="${note.id}">Delete</button>
                        </div>
                        ${timerContainerHTML}
                    </div>
                `;
                notesList.appendChild(noteEl);
            });
        }
    };

    // Saves a new note to localStorage
    const saveNote = () => {
        const title = noteTitleInput.value.trim();
        const content = noteContentInput.value.trim();
        const tagsString = noteTagsInput.value.trim();
        if (title && content) {
            const now = Date.now();
            const tags = tagsString ? tagsString.split(',').map(tag => tag.trim()).filter(Boolean) : [];

            const newNote = {
                id: now, // Use timestamp as a simple unique ID and for sorting
                title,
                content,
                modified: now, // Initially, modified time is the same as creation
                tags: tags,
                deletionTime: now + NOTE_LIFESPAN_MS, // Set deletion time 30 days from now
                isArchived: false // New notes are not archived by default
            };
            showNotification('Note Saved!', `The note "${title}" has been saved. It will be auto-deleted in 30 days unless archived.`);
            notes.push(newNote);
            notes.sort((a, b) => a.id - b.id); // Keep notes sorted by creation time (oldest first)
            localStorage.setItem('notes', JSON.stringify(notes));
            updateView();
            // Hide creator and show notes list
            noteCreator.classList.add('hidden');
            noteActions.classList.add('hidden');
            notesHeader.classList.remove('hidden');
            notesList.classList.remove('hidden');
        }
    };

    // --- Per-Note Auto-Delete Timer Logic ---

    // Shows a browser notification if permission is granted
    const showNotification = (title, body) => {
        if (!('Notification' in window)) {
            console.log("This browser does not support desktop notifications.");
            return;
        }

        if (Notification.permission === 'granted') {
            new Notification(title, { body });
        } else if (Notification.permission !== 'denied') {
            // We could ask again here, but it's better to ask once upfront.
            console.log('Notification permission has not been granted.');
        }
    };

    // Formats milliseconds into HH:MM:SS
    const formatTime = (ms) => {
        if (ms < 0) ms = 0;
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
        const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
        const seconds = (totalSeconds % 60).toString().padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    };

    const startMainTimer = () => {
        mainTimerInterval = setInterval(() => {
            const now = Date.now();
            let notesWereDeleted = false;

            // Check for notes that are about to expire to send a warning
            notes.forEach(note => {
                // Skip archived notes from warnings
                if (note.isArchived) return;

                const remainingMs = note.deletionTime - now;
                if (remainingMs > 0 && remainingMs < NOTIFICATION_WARNING_MS && !warnedNoteIds.has(note.id)) {
                    showNotification(
                        'Note Expiration Warning',
                        `The note "${note.title}" will be deleted in less than 5 minutes.`
                    );
                    warnedNoteIds.add(note.id);
                }
            });

            // Filter out expired notes and clean up the warned IDs set
            notes = notes.filter(note => {
                // Always keep archived notes
                if (note.isArchived) {
                    return true;
                }
                const isExpired = now >= note.deletionTime;
                if (isExpired) {
                    warnedNoteIds.delete(note.id); // Clean up
                    notesWereDeleted = true;
                }
                return !isExpired;
            });

            // If a note was deleted, update storage and the entire view
            if (notesWereDeleted) {
                localStorage.setItem('notes', JSON.stringify(notes));
                updateView();
            }

            // If timers are visible, update their text content directly
            if (showDeletionTimers) { // This will naturally skip archived notes as their containers are hidden
                document.querySelectorAll('.note-deletion-timer').forEach(timerEl => {
                    const deletionTime = parseInt(timerEl.dataset.deletionTime, 10);
                    const remainingMs = deletionTime - now;
                    timerEl.textContent = formatTime(remainingMs);
                });
            }
        }, 1000); // Run every second
    };

    // --- Individual Note Actions ---

    const handleDeleteNote = (id) => {
        if (confirm('Are you sure you want to delete this note?')) {
            const noteIdNum = parseInt(id, 10);
            warnedNoteIds.delete(noteIdNum); // Clean up warned ID if it exists
            notes = notes.filter(note => note.id !== noteIdNum);
            localStorage.setItem('notes', JSON.stringify(notes));
            updateView();
        }
    };

    const handleArchiveNote = (id) => {
        const noteIdNum = parseInt(id, 10);
        const noteIndex = notes.findIndex(note => note.id === noteIdNum);

        if (noteIndex > -1) {
            const note = notes[noteIndex];
            note.isArchived = !note.isArchived; // Toggle status

            if (note.isArchived) {
                showNotification('Note Archived', `"${note.title}" is now archived and will not be auto-deleted.`);
            } else {
                note.deletionTime = Date.now() + NOTE_LIFESPAN_MS; // Reset timer on unarchive
                showNotification('Note Unarchived', `"${note.title}" is now active. The 30-day deletion timer has been reset.`);
            }
            localStorage.setItem('notes', JSON.stringify(notes));
            updateView();
        }
    };

    const handleEditNote = (id) => {
        const noteIdNum = parseInt(id, 10);
        const noteToEdit = notes.find(note => note.id === noteIdNum);
        const noteElement = document.querySelector(`.saved-note[data-id='${id}']`);

        if (!noteToEdit || !noteElement) return;

        // Replace the note's content with an inline editor
        noteElement.innerHTML = `
            <div class="note-editor-inline">
                <input type="text" class="edit-title-input" value="${noteToEdit.title}">
                <input type="text" class="edit-tags-input" placeholder="Tags, comma-separated" value="${(noteToEdit.tags || []).join(', ')}">
                <textarea class="edit-content-input">${noteToEdit.content}</textarea>
                <div class="saved-note-actions">
                    <button class="save-edit-btn" data-id="${id}">Save</button>
                </div>
            </div>
        `;
    };

    const handleSaveEdit = (id) => {
        const noteIdNum = parseInt(id, 10);
        const noteElement = document.querySelector(`.saved-note[data-id='${id}']`);
        
        const newTitle = noteElement.querySelector('.edit-title-input').value.trim();
        const newContent = noteElement.querySelector('.edit-content-input').value.trim();
        const newTagsString = noteElement.querySelector('.edit-tags-input').value.trim();

        if (newTitle && newContent) {
            const noteIndex = notes.findIndex(note => note.id === noteIdNum);
            if (noteIndex > -1) {
                const newTags = newTagsString ? newTagsString.split(',').map(tag => tag.trim()).filter(Boolean) : [];

                notes[noteIndex].title = newTitle;
                notes[noteIndex].content = newContent;
                notes[noteIndex].modified = Date.now(); // Update the modified timestamp
                notes[noteIndex].deletionTime = Date.now() + NOTE_LIFESPAN_MS; // Reset timer on edit
                notes[noteIndex].tags = newTags;
                showNotification('Note Updated!', `The note "${newTitle}" has been updated. The 30-day deletion timer has been reset.`);
                localStorage.setItem('notes', JSON.stringify(notes));
                updateView(); // Re-render the view
            }
        }
    };


    // --- Event Listeners ---
    newNoteBtn.addEventListener('click', () => {
        noteCreator.classList.remove('hidden');
        noteActions.classList.remove('hidden');
        noteTitleInput.value = '';
        noteContentInput.value = '';
        noteTagsInput.value = '';
        notesHeader.classList.add('hidden');
        notesList.classList.add('hidden');
        welcomeMessage.style.display = 'none';
    });

    saveNoteBtn.addEventListener('click', saveNote);
    
    cancelNoteBtn.addEventListener('click', () => {
        noteCreator.classList.add('hidden');
        noteActions.classList.add('hidden');
        notesHeader.classList.remove('hidden');
        notesList.classList.remove('hidden');
    });

    // Listener for the new timer toggle button
    toggleTimersBtn.addEventListener('click', () => {
        showDeletionTimers = !showDeletionTimers; // Toggle the state
        toggleTimersBtn.textContent = showDeletionTimers ? 'Hide Deletion Times' : 'Show Deletion Times';
        // Re-render to show/hide the timer containers
        // The main timer will handle updating the text if they are shown
        updateView();
    });


    // Listener for the sort dropdown
    sortOptions.addEventListener('change', (e) => {
        currentSortOrder = e.target.value;
        updateView();
    });

    // Listener for individual note actions (edit, delete, save-edit) using event delegation
    notesList.addEventListener('click', (e) => {
        const target = e.target;
        const noteId = target.dataset.id;

        if (!noteId) return;

        if (target.classList.contains('delete-note-btn')) {
            handleDeleteNote(noteId);
        } else if (target.classList.contains('archive-note-btn')) {
            handleArchiveNote(noteId);
        } else if (target.classList.contains('edit-note-btn')) {
            handleEditNote(noteId);
        } else if (target.classList.contains('save-edit-btn')) {
            handleSaveEdit(noteId);
        }
    });

    // --- Initialization ---

    // Request permission for notifications on load
    const requestNotificationPermission = () => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    };

    // Initial Render on page load
    requestNotificationPermission();
    updateView();
    startMainTimer(); // Start the background timer
});