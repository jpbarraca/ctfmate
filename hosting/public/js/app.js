ONLY_GCS = true;
function initPad(username) {
    var firepadRef = firebase.database().ref();
    var urlParams = new URLSearchParams(location.hash.slice(1));
    var teamSecretKey = urlParams.get('teamSecretKey');
    if (teamSecretKey) {
        firepadRef = firepadRef.child(teamSecretKey);
    } else {
        firepadRef = firepadRef.push();
        urlParams.set('teamSecretKey', firepadRef.key);
        teamSecretKey = firepadRef.key;
        location.hash = urlParams;
    }
    var timerRef = firepadRef.child('timer');
    var timerTime = 0;
    var timerNotified = false;

    function updateTimer() {
        var left = timerTime - new Date().getTime();
        if (left <= 0) {
            if (!timerNotified && timerTime) {
                sendNotification(
                    'The CTF is over! Time to shut eye =D', {
                        body: '¯\\_(ツ)_/¯',
                        requireInteraction: true
                    }, '');
                timerNotified = true;
            }
            left = timerTime = 0;
        }
        var secs = (left / 1e3 % 60) | 0;
        var mins = ((left / 60e3) % 60) | 0;
        var hours = (left / 3600e3) | 0;
        if (timerTime) {
            document.title = `CTFmate: ${hours}h:${mins}m:${secs}s`;
        }
    }
    setInterval(updateTimer, 1e3);
    window.startTimer = function(dateString, timeString) {
        if (!dateString || !timeString) return;
        var countdown = new Date(`${dateString} ${timeString}`);
        firepadRef.child('timer').set(countdown.getTime());
    };
    timerRef.on('value', function(snap) {
        timerTime = snap.val();
        timerNotified = false;
        var datetime = new Date(timerTime);
        var days = new Date(
            datetime.getFullYear(),
            datetime.getMonth(),
            datetime.getDate() + 1);
        var seconds = datetime.getTime() - days.getTime();
        document.getElementById('dateTimer').valueAsDate = days;
        document.getElementById('timeTimer').valueAsNumber = seconds;
    });
    var lastTaskChecked = '';

    function remindTakingNotes() {
        if (!window.currentTask) return;
        if (window.currentTask == lastTaskChecked) {
            notElem.MaterialSnackbar.showSnackbar({
                message: 'Don\'t forget to leave some notes for this task ;)',
            });
        }
    }
    setInterval(remindTakingNotes, 600e3);
    var chatRef = firepadRef.child('chat');
    var taskListRef = firepadRef.child('tasks');
    var taskFavorites = window.taskFavorites;
    var userListRef = firepadRef.child('users');
    var taskPadsRef = firepadRef.child('taskpads');
    var myUserRef = userListRef.push();
    myUserRef.onDisconnect().remove();
    myUserRef.set({
        who: username,
        radio: false
    });
    var userElems = {};
    var avatarElems = {};
    var nicknameKeys = {};
    var userColors = {};
    var repeatStyle = {};
    var notElem = document.getElementById('ctfpad-notification');
    var wasOffline = false;
    var wasOnline = false;
    var connectedRef = firebase.database().ref('.info/connected');
    connectedRef.on('value', function(snap) {
        if (snap.val() === true) {
            console.log('Connected');
            if (wasOnline && wasOffline) {
                if (confirm('Internet is back, reload page?')) {
                    location.reload(true);
                }
            }
            wasOnline = true;
        } else {
            wasOffline = true;
            console.log('Lost internet connection');
            if (wasOnline) {
                notElem.MaterialSnackbar.showSnackbar({
                    message: 'You are currently offline',
                    timeout: 3600e3,
                    actionHandler: function() {
                        location.reload(true);
                    },
                    actionText: 'Reload'
                });
            }
        }
    });
    var editor = ace.edit('team-firepad');
    editor.session.setMode("ace/mode/markdown");
    editor.getSession().setUseWrapMode(true);
    editor.setShowPrintMargin(false);
    editor.setOption('showGutter', false);
    var firepad = Firepad.fromACE(firepadRef, editor, {
        userId: myUserRef.key,
        defaultText: `CTF Details
===========
*Scoreboard*
- http://...
*Credentials*
- user/password
`
    });
    firepad.on('ready', function() {
        document.body.dataset.loading = false;
        document.getElementById('endOfChat').scrollIntoView();
        localStorage.notificationsEnabled = document.getElementById('notificationsCheckbox').checked;
    });
    chatRef.on('child_added', function(entry) {
        var chat = entry.val();
        showChat(chat.what, chat.who, chat.when, chat.where, chat.color);
    });
    window.showChat = function(what, who, when, where, color) {
        var div = document.createElement('div');
        var endOfChat = document.getElementById('endOfChat');
        var endOfTaskChat = document.getElementById('endOfTaskChat');
        div.className = 'ctfpad-chat-message-container';
        var quoteRegExp = /(?:(```|`|\*\*|\*|~~|__|_)([\s\S]*?)\1)/;
        var linkRegExp = /((?:\bhttps?:\/\/(?:[^\s@/?#\\]*@)?(?:[.\w[\]:-]+)|\bwww[.][\w.:-]+)(?:[\/?#][^\s()]*?(?:\([^\s)]*\)|[^\s])*?(?=[)]?[.,?)](?:\s|$)|(?:\s|$)))?)/;
        var emojiRegExp = /((?:^|\b(?=\w)|\B(?=\W))[(]?[=:;8x]['_`"]?[¬"'^vox-]?[{}]?[)(o|¦!DSXCP/\\*#@?](?=\s|$))/;
        var formatRegExp = new RegExp([
            quoteRegExp.source, linkRegExp.source, emojiRegExp.source
        ].join('|'), 'ig');
        var whatNode = div.appendChild(document.createTextNode(what));
        var ranges = [];
        var quoteClass = {
            '`': 'ctfpad-quote-code',
            '```': 'ctfpad-quote-code',
            '*': 'ctfpad-quote-italics',
            '_': 'ctfpad-quote-italics',
            '**': 'ctfpad-quote-bold',
            '__': 'ctfpad-quote-bold',
            '~~': 'ctfpad-quote-strike'
        };
        what.replace(formatRegExp,
            (match, quotes = '', text = '', url, emoji, offset) => {
                ranges.unshift(document.createRange());
                var start = offset + quotes.length;
                var end = offset + match.length - quotes.length;
                ranges[0].setStart(whatNode, start);
                ranges[0].setEnd(whatNode, end);
                ranges[0].quoteClass = quoteClass[quotes];
                ranges[0].link = url;
                ranges[0].emoji = emoji;
            });
        var quoteNodes = ranges.map(range => {
            if (range.link) {
                var a = document.createElement('a');
                var url = range.link;
                if (url.indexOf('www.') == 0) {
                    url = '//' + url;
                }
                a.href = url;
                a.target = '_blank';
                range.surroundContents(a);
            } else {
                var span = document.createElement('span');
                if (range.quoteClass) {
                    span.className = range.quoteClass;
                    span.setAttribute('onclick', `var r=document.createRange(), s=getSelection();r.selectNode(this);s.removeAllRanges();s.addRange(r);`);
                } else if (range.emoji) {
                    if (range.emoji.indexOf('(') == 0) {
                        span.dataset.hair = true;
                    }
                    span.className = 'ctfpad-quote-emoji';
                }
                range.surroundContents(span);
            }
        });
        div.style.textDecorationColor = color || 'transparent';
        div.style.borderLeftColor = color || 'transparent';
        div.dataset.who = who || 'CTFmate';
        div.dataset.when = when ? new Date(when).toLocaleString() : '';
        div.dataset.where = where || '';
        div.dataset.color = color;
        if (!repeatStyle[`${color}-${who}-${where}`]) {
            repeatStyle[`${color}-${who}-${where}`] = true;
            document.getElementById('ctfPadCustomStyles').sheet.insertRule(`.ctfpad-chat-message-container[data-who=${JSON.stringify(who)}][data-color=${JSON.stringify(color)}][data-where=${JSON.stringify(where)}] + .ctfpad-chat-message-container[data-who=${JSON.stringify(who)}][data-color=${JSON.stringify(color)}][data-where=${JSON.stringify(where)}]::before{display:none;}`);
        }
        var mentioned = (what.match(/@\w+/g) || []).some(mention => {
            if (mention == `@${username}` || mention == '@everyone') {
                sendNotification(
                    `${who} mentioned you on #${where||'The Goss'}`, {
                        body: what,
                        vibrate: [100],
                        requireInteraction: true,
                    }, where);
                return true;
            }
        });
        var blacklist = [
            'dropped a bear', 'rocked up', 'shot through', 'joined the telly', 'gave this task to the garbo'
        ].indexOf(what);
        if (blacklist > -1) {
            div.dataset.showNickname = true;
            document.body.dataset.dropbear = !blacklist;
        } else if (!mentioned && taskFavorites[where] && who != username) {
            sendNotification(`#${where}`, {
                body: `${who}: ${what}`,
                renotify: true,
                tag: `${where}`
            }, where);
        }
        div.dataset.highlight = mentioned;
        document.getElementById('chatMessages').insertBefore(
            div.cloneNode(true), endOfChat);
        document.getElementById('taskChatMessages').insertBefore(
            div.cloneNode(true), endOfTaskChat);
        endOfChat.scrollIntoView();
        endOfTaskChat.scrollIntoView();
    };
    window.sayChat = function(what, where) {
        chatRef.push({
            who: username,
            what: what,
            when: firebase.database.ServerValue.TIMESTAMP,
            where: where || '',
            color: userColors[myUserRef.key]
        });
    };
    var audioContext = new AudioContext;
    var oscillator = audioContext.createOscillator();
    oscillator.frequency.value = 987.77;
    var gain = audioContext.createGain();
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(audioContext.currentTime);
    audioContext.suspend();
    var beeping = false;

    function beep() {
        if (beeping)
            return;
        beeping = true;
        audioContext.resume();
        gain.gain.exponentialRampToValueAtTime(
            1, audioContext.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(
            0.001, audioContext.currentTime + 0.5);
        setTimeout(_ => {
            audioContext.suspend();
            beeping = false;
        }, 600);
    }
    window.sendNotification = function(title, options, where) {
        var notificationsEnabled = document.getElementById('notificationsCheckbox').checked;
        var isFavorite = taskFavorites[where];
        var hasPermission = Notification.permission == 'granted';
        var isLoading = document.body.className == 'loading';
        if (!hasPermission ||
            isLoading ||
            (!notificationsEnabled && !isFavorite)) {
            console.log(
                'Silenced notification:',
                where, title, options.body);
            return;
        }
        try {
            var notif = new Notification(title, options);
        } catch (e) {
            console.error(e);
        }
        if (where && where != window.currentTask) {
            taskElemsByName[where].dataset.badge = -~taskElemsByName[where].dataset.badge;
        }
        beep();
    };

    function updateFilter() {
        var chatCard = document.getElementById('taskChatCard');
        if (chatCard.hasAttribute('data-filter')) {
            chatCard.dataset.filter = window.currentTask || '';
        }
        var endOfChat = document.getElementById('endOfChat');
        endOfChat.scrollIntoView();
        var endOfTaskChat = document.getElementById('endOfTaskChat');
        endOfTaskChat.scrollIntoView();
    }
    window.currentTask_ = '';
    Object.defineProperty(window, 'currentTask', {
        get: function() {
            return this.currentTask_;
        },
        set: function(t) {
            setTimeout(updateFilter, 1);
            return this.currentTask_ = t;
        }
    });
    var taskNames = {};
    window.addTask = function(category, name) {
        var title = category + ':' + name;
        if (taskNames[title]) {
            return showChat(
                'Error: Task already exists: `' + title + '`', '', '', 'broadcast');
        }
        taskListRef.push({
            category: category,
            name: name,
            taskpad: taskPadsRef.push().key,
            done: false,
            help: false,
            almost: false
        });
        sayChat('added task `' + title + '`', '');
    };
    var taskElemsByName = {};
    window.showTask = function(task, entryRef, title) {
        try {
            window.closeTask();
        } catch (e) {}
        window.currentTask = title;
        delete taskElemsByName[title].dataset.badge;
        document.getElementById('taskNotificationToggle').checked = taskFavorites[title];
        var taskView = document.getElementById('taskView');
        var taskpad = task.taskpad;
        var taskUsersRef = entryRef.child('users');
        var active = taskUsersRef.push();
        active.onDisconnect().remove();
        active.set({
            user: myUserRef.key
        });
        var padRef = taskPadsRef.child(taskpad);
        var div = document.getElementById('task-firepad');
        var editor = ace.edit('task-firepad');
        editor.session.setMode("ace/mode/markdown");
        editor.getSession().setUseWrapMode(true);
        editor.setShowPrintMargin(false);
        editor.setOption('showGutter', false);
        editor.focus();
        window.taskEditor = editor;
        var firepad = Firepad.fromACE(padRef, editor, {
            userId: myUserRef.key,
            defaultText: `## Description



## Notes


`});
        var taskTitle = document.getElementById('taskNameTitle');
        var newTitle = taskTitle.cloneNode(false);
        newTitle.appendChild(document.createTextNode(title));
        taskTitle.parentNode.replaceChild(newTitle, taskTitle);
        document.getElementById('taskView').style.display = 'flex';
        document.getElementById('taskView').setAttribute(
            'data-done', task.done);
        document.getElementById('taskView').setAttribute(
            'data-help', task.help);
        document.getElementById('taskView').setAttribute(
            'data-almost', task.almost);
        sayChat('is hacking `' + title + '`');
        document.getElementById('taskView').scrollIntoView();
        var mapping = {};

        function getUserKey(entry) {
            var value = entry.val();
            if (!value) value = mapping[entry.key];
            mapping[entry.key] = value;
            return value.user;
        }

        function updateIconOnline(entry) {
            var userKey = getUserKey(entry);
            setUserIcons({
                [userKey]: 'task'
            });
        }

        function updateIconOffline(entry) {
            var userKey = getUserKey(entry);
            setUserIcons({
                [userKey]: 'away'
            });
        }
        setUserIcons({
            'default': 'away'
        });
        taskUsersRef.on('child_added', updateIconOnline);
        taskUsersRef.on('child_removed', updateIconOffline);
        window.closeTask = function() {
            window.currentTask = '';
            active.onDisconnect().cancel();
            active.remove();
            taskUsersRef.off();
            setUserIcons({
                'default': 'online'
            });
            document.getElementById('taskView').style.display = 'none';
            firepad.dispose();
            div.parentElement.replaceChild(div.cloneNode(false), div);
            sayChat('stopped hacking `' + title + '`', '');
        };
        window.deleteTask = function() {
            closeTask();
            entryRef.remove();
            sayChat('gave this task to the garbo', title);
            sayChat('gave task `' + title + '` to the garbo', '');
        };
        window.markTaskDone = function() {
            var flag = prompt('What is the flag?', '');
            if (flag == undefined) return;
            if (flag) {
                editor.session.insert({
                    row: editor.session.getLength(),
                    column: 0
                }, '\n## Flag\n' + flag + '\n');
            }
            closeTask();
            entryRef.child('done').set(true);
            sayChat('task pwnd! `' + title + '`', '');
            var reactions = ['Ace!', 'Bonza!', 'Reaper!', 'U-Beaut!'];
            sayChat(
                reactions[Math.floor(Math.random() * reactions.length)] +
                '! task pwnd!' + (flag ? ' flag was: `' + flag + '`' : ''), title);
        };
        window.markTaskNotDone = function() {
            closeTask();
            entryRef.child('done').set(false);
            sayChat('task undone :( `' + title + '`', '');
            sayChat('task undone :( ', title);
        };
        window.startTaskVideo = function() {
            try {
                endRadio();
            } catch (e) {}
            open('https://meet.jit.si/CTFmate-task-' + taskpad);
            sayChat('joined the telly for `' + title + '`', '');
            sayChat('joined the telly', title);
        };
        window.helpTask = function() {
            entryRef.child('help').set(
                taskView.dataset.help = task.help = !task.help);
            notElem.MaterialSnackbar.showSnackbar({
                message: !task.help ? 'Not asking for help' : 'Asking for help',
                timeout: 2000,
                actionHandler: function() {
                    entryRef.child('help').set(
                        taskView.dataset.help = task.help = !task.help);
                },
                actionText: 'Undo'
            });
        };
        window.almostTask = function() {
            entryRef.child('almost').set(
                taskView.dataset.almost = task.almost = !task.almost);
            notElem.MaterialSnackbar.showSnackbar({
                message: !task.almost ? 'Not almost done :(' : 'Almost done!',
                timeout: 2000,
                actionHandler: function() {
                    entryRef.child('almost').set(
                        taskView.dataset.almost = task.almost = !task.almost);
                },
                actionText: 'Undo'
            });
        };
        var github = new firebase.auth.GithubAuthProvider();
        github.addScope('gist');
        var githubToken = localStorage.getItem('githubToken');

        function getGithubToken() {
            firebase.auth().signInWithPopup(github).then(function(res) {
                githubToken = res.credential.accessToken;
                localStorage.setItem('githubToken', githubToken);
            });
        }

        function readBlob(blob) {
            return new Promise(function(res, rej) {
                var reader = new FileReader();
                reader.addEventListener("loadend", function() {
                    var decoder = new TextDecoder('utf-8', {
                        fatal: true
                    });
                    try {
                        res([blob.name, decoder.decode(reader.result)]);
                    } catch (e) {
                        rej(e);
                    }
                });
                reader.readAsArrayBuffer(blob);
            });
        }

        function uploadToGithub(files) {
            var filenames = [];
            var payload = {
                "description": "CTFmate " + title,
                "public": false,
                "files": files.reduce(function(dict, f) {
                    filenames.push(f[0]);
                    dict[f[0]] = {
                        content: f[1]
                    };
                    return dict;
                }, {})
            };
            return fetch(
                    'https://api.github.com/gists', {
                        method: 'POST',
                        body: JSON.stringify(payload),
                        headers: {
                            Authorization: 'token ' + githubToken,
                            'Content-Type': 'application/json'
                        }
                    })
                .then(function(res) {
                    return res.json()
                })
                .then(function(json) {
                    if (!json.html_url) throw 'Upload to github failed';
                    sayChat('Uploaded ' + filenames + ' ' + json.html_url, title);
                    editor.session.insert({
                        row: editor.session.getLength(),
                        column: 0
                    }, '\n' + json.html_url + '#' + filenames);
                });
        }

        function uploadToGCS(files) {
            var promises = [];
            var folder = firebase.storage().ref().child(teamSecretKey).child(title);
            for (var i = 0; i < files.length; i++) {
                promises.push(folder.child(Math.random().toString(36)).child(files[i].name).put(files[i], {
                    contentDisposition: 'attachment; filename="' + files[i].name + '"'
                }).then(function(snap) {
                    return snap.ref.getDownloadURL().then(function(url) {
                        sayChat('Uploaded **' + snap.ref.name + '** ' + url + '#' + snap.ref.name, title);
                        editor.session.insert({
                            row: editor.session.getLength(),
                            column: 0
                        }, '\n*' + snap.ref.name + '*\n' + url + '#' + snap.ref.name);
                    });
                }).catch(function(e) {
                    showChat('Error: Upload error =(', '', '', title);
                }));
            }
            return Promise.all(promises);
        }

        function uploadFile(elem) {
            if (ONLY_GCS) return uploadToGCS(elem.files);
            var files = [];
            var size = 0;
            for (var i = 0; i < elem.files.length; i++) {
                size += elem.files[i].size;
                if (size > 65536) {
                    showChat(
                        'Error: Sorry mate, max upload is 64KB', '', '', title);
                    return;
                }
                files.push(readBlob(elem.files[i]));
            }
            return Promise.all(files).then(uploadToGithub).catch(function() {
                uploadToGCS(elem.files);
            });
        }
        window.attachFile = function() {
            if (!githubToken && !ONLY_GCS) {
                getGithubToken();
            } else {
                fileElement.click();
                fileElement.onchange = function() {
                    if (fileElement.files.length) {
                        uploadFile(fileElement).then(function() {
                            fileElement.value = '';
                        });
                    }
                };
            }
        };
    };
    var taskElems = {};
    taskListRef.on('child_added', function(entry) {
        var task = entry.val();
        var users = entry.child('users');
        var title = task.category + ':' + task.name;
        taskNames[title] = true;
        var div = taskElems[entry.key] = document.createElement('span');
        taskElemsByName[title] = div;
        div.dataset.done = task.done;
        div.dataset.help = task.help;
        div.dataset.almost = task.almost;
        div.dataset.title = title;
        div.className = 'mdl-chip mdl-chip--contact mdl-badge mdl-badge--overlap ctfpad-task-chip';
        var category = div.appendChild(document.createElement('span'));
        category.className = 'mdl-chip__contact mdl-color--teal mdl-color-text--white';
        category.appendChild(document.createTextNode(task.category));
        var text = div.appendChild(document.createElement('span'));
        text.className = 'mdl-chip__text';
        text.appendChild(document.createTextNode(title));
        var done = text.appendChild(document.createElement('i'));
        var help = text.appendChild(document.createElement('i'));
        var almost = text.appendChild(document.createElement('i'));
        done.className += 'material-icons ctfpad-task-chip-done';
        help.className += 'material-icons ctfpad-task-chip-help';
        almost.className += 'material-icons ctfpad-task-chip-almost';
        done.innerHTML = 'flag';
        help.innerHTML = 'help_outline';
        almost.innerHTML = 'error_outline';
        var taskState = task.done ? 'Done' : users.numChildren() ? 'Active' : 'Pending';
        document.getElementById('taskList' + taskState).appendChild(div);
        div.onclick = function() {
            showTask(task, entry.ref, title);
        };
        document.getElementById('ctfPadCustomStyles').sheet.insertRule(`.ctfpad-chat[data-filter=${JSON.stringify(title)}] .ctfpad-chat-message-container:not([data-where=${JSON.stringify(title)}]){display:none;}`);
    });
    taskListRef.on('child_changed', function(entry) {
        var task = entry.val();
        var users = entry.child('users');
        var title = task.category + ':' + task.name;
        var div = taskElems[entry.key];
        div.dataset.done = task.done;
        if (String(task.help) != div.dataset.help && task.help) {
            showChat('Asking for help', '', '', title);
            showChat('Asking for help with `' + title + '`');
        }
        div.dataset.help = task.help;
        if (String(task.almost) != div.dataset.almost && task.almost) {
            showChat('Almost done', '', '', title);
            showChat('Almost done with `' + title + '`');
        }
        div.dataset.almost = task.almost;
        var taskState = task.done ? 'Done' : users.numChildren() ? 'Active' : 'Pending';
        document.getElementById('taskList' + taskState).appendChild(div);
        div.onclick = function() {
            showTask(task, entry.ref, title);
        };
    });
    taskListRef.on('child_removed', function(entry) {
        var task = entry.val();
        var div = taskElems[entry.key];
        div.parentElement.removeChild(div);
        taskNames[div.dataset.title] = false;
    });

    function getUserKeyForName(nick) {
        return nicknameKeys[nick] || myUserRef.key;
    }
    userListRef.on('child_added', function(entry) {
        var user = entry.val();
        nicknameKeys[entry.key] = user.who;
        userColors[entry.key] = user.color;
        var div = userElems[entry.key] = document.createElement('span');
        div.dataset.who = user.who || '';
        div.dataset.radio = user.radio;
        div.dataset.icon = 'online';
        div.className = 'mdl-chip mdl-chip--contact ctfpad-mate-chip';
        var mic = document.createElement('i');
        mic.className = 'material-icons ctfpad-mate-chip-icon ctfpad-mate-mic';
        mic.innerHTML = 'mic';
        var pen = document.createElement('i');
        pen.className = 'material-icons ctfpad-mate-chip-icon ctfpad-mate-pen';
        pen.innerHTML = 'mode_edit';
        var task = document.createElement('i');
        task.className = 'material-icons ctfpad-mate-chip-icon ctfpad-mate-task';
        task.innerHTML = 'visibility';
        var away = document.createElement('i');
        away.className = 'material-icons ctfpad-mate-chip-icon ctfpad-mate-away';
        away.innerHTML = 'visibility_off';
        var online = document.createElement('span');
        online.className = 'ctfpad-mate-chip-icon ctfpad-mate-online';
        online.appendChild(
            document.createTextNode(div.dataset.who.charAt()));
        var avatar = div.appendChild(document.createElement('span'));
        avatar.className = 'mdl-chip__contact';
        avatar.appendChild(mic);
        avatar.appendChild(pen);
        avatar.appendChild(task);
        avatar.appendChild(away);
        avatar.appendChild(online);
        avatar.style.backgroundColor = user.color;
        avatarElems[entry.key] = avatar;
        var text = div.appendChild(document.createElement('span'));
        text.className = 'mdl-chip__text';
        text.appendChild(document.createTextNode(user.who));
        document.getElementById('ctfpadTeamMates').appendChild(div);
        if (entry.key != myUserRef.key) {
            showChat('rocked up', user.who);
        }
    });
    userListRef.on('child_changed', function(entry) {
        var user = entry.val();
        var div = userElems[entry.key];
        div.dataset.radio = user.radio;
        var avatar = avatarElems[entry.key];
        avatar.style.backgroundColor = user.color;
    });
    userListRef.on('child_removed', function(entry) {
        var div = userElems[entry.key];
        div.parentElement.removeChild(div);
        showChat('shot through', div.dataset.who);
    });
    window.startRadio = function() {
        sayChat('joined the Billabong!');
        var api = new JitsiMeetExternalAPI("meet.jit.si", {
            roomName: "CTFmate-" + firepadRef.key,
            width: 0,
            height: 0,
            parentNode: document.getElementById('ctfpadradio'),
            configOverwrite: {
                startAudioOnly: true,
                disableDesktopSharing: true,
                enableRecording: false,
                disableThirdPartyRequests: true,
            },
            interfaceConfigOverwrite: {
                DISPLAY_WELCOME_PAGE_CONTENT: false,
                AUTHENTICATION_ENABLE: false,
                TOOLBAR_BUTTONS: [],
                SETTINGS_SECTIONS: [],
                MOBILE_APP_PROMO: false,
                RANDOM_AVATAR_URL_PREFIX: 'data:,'
            },
            onload: function() {
                document.getElementById('radioOff').style.display = 'none';
                document.getElementById('radioOn').style.display = 'flex';
            }
        });
        myUserRef.child('radio').set(true);
        api.executeCommand('displayName', username);
        api.addEventListener('audioMuteStatusChanged', function(state) {
            radioOn.dataset.muted = state.muted;
        });
        window.radioMuteMicrophone = function() {
            api.executeCommand('toggleAudio');
        };
        window.endRadio = function() {
            sayChat('left the Billabong. Cheerio!');
            myUserRef.child('radio').set(false);
            api.executeCommand('hangup');
            document.getElementById('radioOff').style.display = 'flex';
            document.getElementById('radioOn').style.display = 'none';
            api.dispose();
        };
    };

    function getLink() {
        return location.href;
    };
    window.inviteByEmail = function() {
        var params = new URLSearchParams();
        params.set('subject', 'G\'day! Join my team on CTFmate');
        params.set('body', 'CTFmate is a collaboration tool for playing CTF competitions.\n\nTo join my team on CTFmate click here\n\n\t' + getLink());
        open('mailto:?' + params);
    };
    window.inviteByLink = function() {
        prompt('Share this link with all your mates:', getLink());
    };
    window.setUserIcons = function(obj) {
        Object.keys(userElems).forEach(key => {
            userElems[key].dataset.icon = obj[key] || obj.default || userElems[key].dataset.icon;
        });
    };
}

function init() {
    [...document.querySelectorAll("dialog")].forEach(dialog => dialogPolyfill.registerDialog(dialog));
    document.getElementById('notificationsCheckbox').checked = localStorage.notificationsEnabled && JSON.parse(localStorage.notificationsEnabled);
    window.taskFavorites = localStorage.taskFavorites ? JSON.parse(localStorage.taskFavorites) : {};
    window.onbeforeunload = function() {
        localStorage.taskFavorites = JSON.stringify(window.taskFavorites);
    };
    document.getElementById('nickNameDialog').showModal();
}
addEventListener('load', init);
