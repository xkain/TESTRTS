// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS

// =========================================================================
// SECTION : PROGRAMMATION HORAIRE (SCHEDULES)
// =========================================================================
// Extrait de la classe Somfy (70-somfy.js, trop volumineuse) : ces méthodes sont greffées sur
// Somfy.prototype après coup. La recherche de méthode sur un prototype est dynamique -- elle
// n'est pas figée à l'instanciation -- donc l'ordre de chargement entre ce fichier et
// `var somfy = new Somfy()` (fin de 70-somfy.js) n'a aucune importance. Tous les appels existants
// (somfy.openEditScheduleGroup(...), ROUTE_EDITORS dans 20-shell.js, les onclick inline...)
// continuent de fonctionner sans changement : c'est la même instance, le même prototype.
class _SomfySchedule {
    updateScheduleList(cb) {
        getJSONSync('/schedules', (err, schedules) => {
            if (err) {
                logger.error('Failed to load schedules:', err);
                ui.serviceError(err);
            }
            else this.setScheduleList(schedules);
            if (typeof cb === 'function') cb();
        });
    }
    // Rendu des programmations rattachées à un équipement/groupe précis, sous forme de cartes pleine
    // largeur (une par ligne), dans le bloc "Options" de son formulaire d'édition (voir
    // openAddScheduleInline/openEditScheduleGroupInline). Cliquer la carte ouvre l'édition complète ;
    // l'icône poubelle supprime la fiche entière (confirmation via deleteScheduleGroup).
    // Activé/désactivé (dimming de la carte) reste piloté depuis l'édition (switch de l'overlay) --
    // pas d'action rapide sur la carte elle-même.
    // Trie une liste de plannings par heure EFFECTIVE (minutes locales depuis minuit, décalage
    // solaire déjà appliqué), pas sur hour/minute bruts : une règle solaire n'a pas d'heure fixe
    // pertinente dans ces deux champs (reliquat non utilisé côté firmware, cf.
    // Schedule.cpp::checkSchedules) -- trier dessus mélangeait l'ordre affiché. Partagé par
    // renderScheduleBadges (bloc Options d'un équipement/groupe) et setScheduleList (page Plannings).
    groupKeyOf(sc) {
        if (!sc) return '';
        return `${sc.targetType === 'group' ? 'g' : 's'}${sc.targetId}-${sc.dayMask || 0}`;
    }
    parseGroupKey(key) {
        const m = /^([sg])(\d+)-(\d+)$/.exec(key || '');
        if (!m) return null;
        return {
            targetType: m[1] === 'g' ? 'group' : 'shade',
            targetId: parseInt(m[2], 10),
            dayMask: parseInt(m[3], 10)
        };
    }
    _groupSchedules(list) {
        const byKey = new Map();
        (list || []).forEach(sc => {
            const key = this.groupKeyOf(sc);
            let group = byKey.get(key);
            if (!group) {
                group = {
                    key: key,
                    targetType: sc.targetType,
                    targetId: sc.targetId,
                    dayMask: sc.dayMask || 0,
                    name: '',
                    enabled: false,
                    steps: []
                };
                byKey.set(key, group);
            }
            group.steps.push(sc);
        });
        const groups = Array.from(byKey.values());
        groups.forEach(group => {
            group.steps = this._sortSchedulesByEffectiveTime(group.steps);
            group.name = (group.steps[0] && group.steps[0].sc.name) || '';
            group.enabled = group.steps.some(step => makeBool(step.sc.enabled));
        });
        groups.sort((a, b) => {
            const ea = a.steps[0] ? (a.steps[0].effectiveMinutes ?? 9999) : 9999;
            const eb = b.steps[0] ? (b.steps[0].effectiveMinutes ?? 9999) : 9999;
            return ea - eb;
        });
        return groups;
    }
    scheduleGroups(targetType, targetId) {
        const list = (typeof targetType === 'undefined')
            ? this.schedules
            : (this.schedules || []).filter(sc => sc.targetType === targetType && sc.targetId === targetId);
        return this._groupSchedules(list);
    }
    getScheduleGroup(key) {
        return this._groupSchedules(this.schedules).find(group => group.key === key) || null;
    }
    _sunTimesToday() {
        const geo = (typeof general !== 'undefined' && general._geoSettings) || {};
        const hasGeo = typeof geo.geoLat === 'number' && geo.geoLat >= -90 && geo.geoLat <= 90;
        return hasGeo ? computeSunUtcMinutes(geo.geoLat, geo.geoLon, new Date()) : null;
    }
    // null = heure indéterminable AUJOURD'HUI : règle solaire alors que la position n'est pas
    // configurée, ou jour/nuit polaire. Le firmware ignore la règle dans ce cas (cf.
    // ScheduleController::_getEffectiveTime), l'interface la range donc en fin de liste.
    _effectiveMinutesOf(sc, sunTimes) {
        if (sc.timeRef === 'sunrise' || sc.timeRef === 'sunset') {
            const baseUtc = sunTimes ? (sc.timeRef === 'sunrise' ? sunTimes.sunriseUtcMinutes : sunTimes.sunsetUtcMinutes) : null;
            const baseLocal = baseUtc !== null ? sunUtcMinutesToLocal(baseUtc) : null;
            return baseLocal !== null ? baseLocal + (sc.sunOffset || 0) : null;
        }
        return sc.hour * 60 + sc.minute;
    }
    _sortSchedulesByEffectiveTime(list) {
        const sunTimes = this._sunTimesToday();
        const withEffective = list.map(sc => ({ sc, effectiveMinutes: this._effectiveMinutesOf(sc, sunTimes) }));
        withEffective.sort((a, b) => (a.effectiveMinutes ?? 9999) - (b.effectiveMinutes ?? 9999));
        return withEffective;
    }
    // Icône d'en-tête de la carte : celle du TYPE de la cible, comme les cartes équipement et
    // groupe des autres écrans (cf. shadeTypes[].indic) -- une programmation se reconnaît ainsi au
    // même coup d'oeil que l'équipement qu'elle pilote.
    _scheduleTargetIcon(group) {
        if (group.targetType === 'group') return '#svg-group';
        const shade = (this.shades || []).find(s => s.shadeId === group.targetId);
        const st = shade ? this.shadeTypes.find(x => x.type === shade.shadeType) : null;
        return `#${st ? st.indic : 'svg-indicShutter'}`;
    }
    // Construit le HTML d'une fiche de planning (.schedule-card, cf. overlays.css) : un groupe =
    // une cible + des jours + N horaires (cf. _groupSchedules). Trois zones -- en-tête d'identité
    // (repris du gabarit commun à toutes les cartes de l'application : pastille, nom, sous-titre,
    // poubelle), une ligne par horaire, et les jours en pied. Partagé par renderScheduleBadges
    // (cible déjà connue : pas de sous-titre) et setScheduleList (page Plannings : sous-titre
    // affiché), via editFn/showTarget.
    _buildScheduleGroupCardHtml(group, { showTarget, editFn }) {
        const first = group.steps[0];
        if (!first) return '';
        const openClick = `event.stopPropagation(); somfy.${editFn}('${group.key}');`;

        const daysHtml = SCHEDULE_DAY_DEFS.map(d => {
            const active = (group.dayMask & d.bit) !== 0;
            return `<span${active ? ' class="active"' : ''}>${tr(d.key).charAt(0)}</span>`;
        }).join('');

        // Programmation entièrement éteinte : un seul badge, dans l'en-tête. Sinon, le badge suit
        // l'horaire concerné -- dire "désactivée" en haut d'une fiche dont un seul horaire dort
        // serait faux.
        const offBadge = `<span class="schedule-badge-off">${tr('DISABLED_F')}</span>`;
        const hoursHtml = group.steps.map(({ sc, effectiveMinutes }) => {
            const t = formatMinutesOfDay(effectiveMinutes);
            const isSolar = (sc.timeRef === 'sunrise' || sc.timeRef === 'sunset');
            const trigger = isSolar ? `<span class="schedule-hour-trigger">${this._scheduleTriggerInfoHtml(sc)}</span>` : '';
            const tilt = this._scheduleTiltSuffix(sc, true);
            const tiltHtml = tilt ? `<span class="schedule-hour-tilt">· ${tilt}</span>` : '';
            const rowBadge = (group.enabled && !makeBool(sc.enabled)) ? offBadge : '';
            return `<div class="schedule-card-hour">
            <div class="uniblocSvg-F"><svg><use href="${this._scheduleHourIcon(sc)}"></use></svg></div>
            <span class="schedule-hour-clock">${t.main}${t.ampm ? `<span class="ampm">${t.ampm}</span>` : ''}</span>
            <span class="schedule-hour-action"><span>${this._scheduleActionMain(sc)}</span>${tiltHtml}${trigger}</span>
            ${rowBadge}
            </div>`;
        }).join('');

        const title = (group.name && group.name.length > 0) ? group.name : formatMinutesOfDay(first.effectiveMinutes).main;
        const subtitle = showTarget ? `<div class="cfg-room">${escHtml(this.scheduleTargetName(group))}</div>` : '';

        return `<div class="schedule-card${group.enabled ? '' : ' is-off'}" data-groupkey="${group.key}" onclick="${openClick}">
        <div class="schedule-card-head">
        <div class="shade-icon-wrapper"><svg><use href="${this._scheduleTargetIcon(group)}"></use></svg></div>
        <div class="schedule-card-name">
        <div class="name-text">${escHtml(title)}</div>
        ${subtitle}
        </div>
        ${group.enabled ? '' : offBadge}
        <label class="schedule-card-switch" for="cbScheduleCard-${group.key}" onclick="event.stopPropagation();">
        <span class="switch">
        <input id="cbScheduleCard-${group.key}" type="checkbox"${group.enabled ? ' checked' : ''} onchange="somfy.toggleScheduleGroup('${group.key}', this.checked);">
        <div></div>
        </span>
        </label>
        <div class="divEditDelete-svg" onclick="event.stopPropagation(); somfy.deleteScheduleGroup('${group.key}');">
        <svg class="icon-svg" style="color: var(--color-danger);"><use href="#svg-trash"></use></svg>
        </div>
        </div>
        ${hoursHtml}
        <div class="schedule-card-days">
        <svg class="schedule-days-icon"><use href="#svg-schedule"></use></svg>
        <span class="schedule-days-label">${tr('SCHEDULE_DAYS_ACTIVE')}</span>
        <div class="col-days-list">${daysHtml}</div>
        </div>
        </div>`;
    }
    // Référence de déclenchement d'un créneau, en clair : "Heure fixe", ou l'icône lever/coucher
    // suivie de la phase et du décalage. Partagé par la ligne d'en-tête et les lignes de créneaux
    // supplémentaires d'une même fiche.
    _scheduleTriggerInfoHtml(sc) {
        if (sc.timeRef !== 'sunrise' && sc.timeRef !== 'sunset') return tr('SCHEDULE_TIME_REF_CLOCK');
        const isRise = sc.timeRef === 'sunrise';
        const phaseLabel = tr(isRise ? 'SCHEDULE_TIME_REF_SUNRISE' : 'SCHEDULE_TIME_REF_SUNSET');
        const offset = sc.sunOffset || 0;
        const offsetSuffix = offset !== 0 ? ` (${offset > 0 ? '+' : ''}${offset}m)` : '';
        const iconHref = isRise ? '#indic-sun' : '#svg-night';
        return `<svg class="schedule-trigger-icon"><use href="${iconHref}"></use></svg>${phaseLabel}${offsetSuffix}`;
    }
    // Texte d'action affiché pour un planning (badge de carte, résumé au survol de l'icône
    // horloge...) -- extrait de _buildScheduleGroupCardHtml pour être partagé avec
    // _buildScheduleTooltipHtml. Mêmes seuils Ouvrir/Fermer que les boutons de choix d'action de
    // ScheduleOverlay (cf. setPosChoice) : les deux doivent nommer une position à l'identique.
    _scheduleActionText(sc) {
        if (sc.positionMode === 'my') return 'MY';
        if (sc.positionMode === 'tiltonly') return `${sc.targetTilt}%`;
        if (sc.targetPos === 0) return tr('BT_OPEN');
        if (sc.targetPos === 100) return tr('BT_CLOSE');
        return `${sc.targetPos}%`;
    }
    // Résumé compact des plannings d'un équipement/groupe (popover affiché au survol/tap de l'icône
    // horloge des cartes dashboard, cf. showScheduleIndicatorPopover) : heure, jours, position --
    // même tri/mêmes libellés que les fiches, mais en lecture seule (pas
    // d'édition/suppression depuis ce popover, qui doit rester un simple coup d'oeil).
    _buildScheduleTooltipHtml(targetType, targetId) {
        const titleHtml = `<div class="schedule-popover-title">${tr('SUBTAB_SCHEDULES')}</div>`;
        const list = (this.schedules || []).filter(sc => sc.targetType === targetType && sc.targetId === targetId);
        if (list.length === 0) {
            return `${titleHtml}<div class="schedule-popover-empty">${tr('EMPTY_SCHEDULE_TITLE')}</div>`;
        }
        const rowsHtml = this._sortSchedulesByEffectiveTime(list).map(({ sc, effectiveMinutes }) => {
            const { main: timeMain, ampm } = formatMinutesOfDay(effectiveMinutes);
            const daysHtml = SCHEDULE_DAY_DEFS.map(d => {
                const active = (sc.dayMask & d.bit) !== 0;
                return `<span${active ? ' class="active"' : ''}>${tr(d.key).charAt(0)}</span>`;
            }).join('');
            return `<div class="schedule-popover-row${sc.enabled ? '' : ' is-off'}">
            <span class="schedule-popover-time">${timeMain}${ampm ? `<span class="ampm">${ampm}</span>` : ''}${this._scheduleTriggerBadgeHtml(sc)}</span>
            <span class="schedule-popover-days">${daysHtml}</span>
            <span class="schedule-popover-pos">${this._scheduleActionText(sc)}</span>
            </div>`;
        }).join('');
        return `${titleHtml}${rowsHtml}`;
    }
    // Icône lever/coucher (#indic-sun/#svg-night) pour un planning déclenché au soleil -- imbriquée
    // dans .schedule-popover-time et positionnée en absolu (cf. CSS) plutôt qu'en enfant flex du
    // rang, pour ne jamais décaler le bloc des jours à droite qu'elle soit présente ou non. Vide
    // pour un déclenchement à heure fixe.
    _scheduleTriggerBadgeHtml(sc) {
        if (sc.timeRef !== 'sunrise' && sc.timeRef !== 'sunset') return '';
        const iconHref = sc.timeRef === 'sunrise' ? '#indic-sun' : '#svg-night';
        return `<svg class="schedule-popover-trigger-icon"><use href="${iconHref}"></use></svg>`;
    }
    // Un planning au moins cible cet équipement/groupe ? Pilote l'atténuation (.no-schedule) de l'icône
    // horloge dans les cartes dashboard -- cf. _syncScheduleIndicators.
    _hasSchedulesFor(targetType, targetId) {
        return (this.schedules || []).some(sc => sc.targetType === targetType && sc.targetId === targetId);
    }
    // Met à jour l'atténuation des icônes horloge du dashboard (équipements/groupes) sans reconstruire
    // les cartes. Appelé après tout (re)chargement des plannings (setScheduleList) ou des cartes
    // elles-mêmes (setShadesList/setGroupsList) : l'ordre entre ces chargements n'est pas garanti
    // au démarrage (cf. loadSomfy), donc chacun se resynchronise indépendamment plutôt que de
    // supposer que this.schedules est déjà peuplé.
    _syncScheduleIndicators() {
        document.querySelectorAll('.schedule-indicator').forEach(el => {
            const targetType = el.getAttribute('data-schedule-target');
            const targetId = parseInt(el.getAttribute('data-schedule-id'), 10);
            el.classList.toggle('no-schedule', !this._hasSchedulesFor(targetType, targetId));
        });
    }
    renderScheduleBadges(containerId, targetType, targetId) {
        const container = get(containerId);
        if (!container) return;

        // Quota GLOBAL (SOMFY_MAX_SCHEDULES côté firmware, partagé par tous les équipements/groupes,
        // pas un quota par cible) : mis à jour à chaque rendu de ce bloc, y compris si CETTE
        // cible précise n'a elle-même aucun planning.
        const quotaSpan = get(containerId === 'divShadeScheduleBadges' ? 'spanScheduleSlotsShade' : 'spanScheduleSlotsGroup');
        if (quotaSpan) {
            const max = this.maxSchedules || 30;
            const remaining = Math.max(0, max - (this.schedules || []).length);
            quotaSpan.textContent = tr('SCHEDULE_SLOTS_REMAINING').replace('{n}', remaining);
        }

        const list = (this.schedules || []).filter(sc => sc.targetType === targetType && sc.targetId === targetId);
        if (list.length === 0) {
            container.innerHTML = `<span class="schedule-badge-empty">${tr('EMPTY_SCHEDULE_TITLE')}</span>`;
            return;
        }

        container.innerHTML = this._groupSchedules(list).map(group =>
            this._buildScheduleGroupCardHtml(group, { showTarget: false, editFn: 'openEditScheduleGroupInline' })
        ).join('');
    }
    // Après un ajout/édition/suppression de planning, remet à jour les badges du formulaire
    // équipement/Groupe actuellement ouvert (le cas échéant), qu'il s'agisse de l'ouverture normale
    // (liste des plannings) ou du flux à la volée depuis ce même formulaire.
    refreshOpenTargetScheduleBadges() {
        const shadeForm = get('somfyShade');
        if (shadeForm && shadeForm.style.display !== 'none') {
            const shadeId = parseInt(get('spanShadeId').innerText, 10);
            if (!isNaN(shadeId)) this.renderScheduleBadges('divShadeScheduleBadges', 'shade', shadeId);
        }
        const groupForm = get('somfyGroup');
        if (groupForm && groupForm.style.display !== 'none') {
            const groupId = parseInt(get('spanGroupId').innerText, 10);
            if (!isNaN(groupId)) this.renderScheduleBadges('divGroupScheduleBadges', 'group', groupId);
        }
    }
    scheduleGroupLabel(group) {
        if (!group) return '';
        if (group.name) return group.name;
        return `${this.scheduleGroupTimesText(group)} - ${this.scheduleTargetName(group)}`;
    }
    scheduleTargetName(sc) {
        if (!sc) return '';
        if (sc.targetType === 'group') {
            const grp = (this.groups || []).find(x => x.groupId === sc.targetId);
            return grp ? grp.name : `${tr('SUBTAB_GROUPS')} #${sc.targetId}`;
        }
        const shd = (this.shades || []).find(x => x.shadeId === sc.targetId);
        return shd ? shd.name : `${tr('SUBTAB_DEVICES')} #${sc.targetId}`;
    }
    // Page Plannings globale (#schedules) : mêmes cartes que renderScheduleBadges (bloc Options
    // d'un équipement/groupe), avec en plus un badge cible (showTarget) puisque cette liste mélange
    // toutes les cibles -- et une édition non verrouillée (cible modifiable).
    // Pas de drag & drop : la liste est simplement triée par heure effective.
    setScheduleList(schedules) {
        this.schedules = schedules || [];

        // Quota GLOBAL (SOMFY_MAX_SCHEDULES côté firmware, partagé par tous les équipements/groupes) :
        // phrase complète dans le même emplacement que .dragtxt (texte d'aide au-dessus des listes
        // équipements/Groupes/Pièces) plutôt qu'un badge compact -- ce total-ci n'est pas rattaché à un
        // seul bouton "Ajouter" comme dans les formulaires équipement/groupe (cf. spanScheduleSlots*),
        // donc une phrase autonome est plus claire ici. Bouton désactivé (même convention
        // button:disabled que partout ailleurs, cf. base.css) une fois le quota atteint, en plus du
        // garde-fou déjà en place dans _openEditScheduleGroup.
        const max = this.maxSchedules || 30;
        const used = this.schedules.length;
        const quotaText = get('divScheduleQuotaText');
        if (quotaText) quotaText.textContent = tr('SCHEDULE_QUOTA_GLOBAL').replace('{n}', used).replace('{max}', max);
        const btnAdd = get('btnAddSchedule');
        if (btnAdd) btnAdd.disabled = used >= max;

        get('divScheduleList').innerHTML = this._groupSchedules(this.schedules).map(group =>
            this._buildScheduleGroupCardHtml(group, { showTarget: true, editFn: 'openEditScheduleGroup' })
        ).join('');

        const hasSchedules = this.schedules.length > 0;
        const empty = get('divScheduleEmptyState'), content = get('divScheduleListContent');
        if (empty) empty.style.display = hasSchedules ? 'none' : 'block';
        if (content) content.style.display = hasSchedules ? '' : 'none';

        this._syncScheduleIndicators();
    }
    populateScheduleTargetSelect(selectedType, selectedId) {
        const sel = get('selScheduleTarget');
        if (!sel) return;
        sel.innerHTML = '';

        const shadeGrp = document.createElement('optgroup');
        shadeGrp.setAttribute('label', tr('SUBTAB_DEVICES'));
        (this.shades || []).forEach(s => {
            const opt = document.createElement('option');
            opt.value = `shade:${s.shadeId}`;
            opt.text = s.name;
            shadeGrp.appendChild(opt);
        });
        if (shadeGrp.children.length > 0) sel.appendChild(shadeGrp);

        const groupGrp = document.createElement('optgroup');
        groupGrp.setAttribute('label', tr('SUBTAB_GROUPS'));
        (this.groups || []).forEach(grp => {
            const opt = document.createElement('option');
            opt.value = `group:${grp.groupId}`;
            opt.text = grp.name;
            groupGrp.appendChild(opt);
        });
        if (groupGrp.children.length > 0) sel.appendChild(groupGrp);

        if (selectedType && typeof selectedId !== 'undefined') sel.value = `${selectedType}:${selectedId}`;
    }
    // Une programmation ne peut pas exister sans cible : tant qu'aucun équipement NI groupe n'a été
    // créé, le sélecteur de cible serait vide et l'enregistrement échouerait au dernier moment sur
    // ERR_SCHEDULE_NO_TARGET, après un formulaire entièrement rempli pour rien. On répond donc au
    // clic sur "Ajouter une programmation" par une explication, sans ouvrir l'overlay. Les groupes
    // comptent au même titre que les équipements (un groupe sans membre reste une cible valide côté
    // firmware). Bouton laissé actif exprès : désactivé, il n'expliquerait rien.
    hasScheduleTarget() {
        return (this.shades || []).length > 0 || (this.groups || []).length > 0;
    }
    // Ouverture "normale" depuis la page générale des Plannings : la cible reste librement
    // sélectionnable (aucun formulaire équipement/Groupe parent n'impose de contexte).
    openEditScheduleGroup(key) {
        confirmDiscardChanges(() => this._openEditScheduleGroup(key, undefined, false));
    }
    // Ajout de planning à la volée depuis l'édition d'un équipement/groupe (bouton + à côté du bloc
    // Pièce) : contourne volontairement confirmDiscardChanges, le formulaire d'origine reste ouvert
    // derrière et ses modifications ne doivent pas être remises en cause. La programmation est
    // pré-ciblée sur cet équipement/groupe (sélecteur de cible verrouillé, cf. ScheduleOverlay) ;
    // contrairement à la pièce, il n'existe pas de champ planning dans le formulaire équipement/groupe
    // à resélectionner après création (relation 1-N).
    openAddScheduleInline(targetType, targetId) {
        if (isNaN(targetId)) return;
        this._openEditScheduleGroup(undefined, { targetType, targetId }, true);
    }
    // Édition d'une fiche depuis le bloc Options (équipement/groupe potentiellement modifié) :
    // même logique que openAddScheduleInline (cible verrouillée, isDirty du parent préservé).
    openEditScheduleGroupInline(key) {
        this._openEditScheduleGroup(key, undefined, true);
    }
    // `key` est une clé de groupe (cf. groupKeyOf), pas un identifiant de règle : c'est elle qui
    // sert aussi de segment d'URL adressable (#schedules/s3-127).
    //
    // Plus aucun appel à /schedule?scheduleId= ici : /schedules renvoie déjà exactement le même
    // objet pour chaque règle (toJSONSchedules et handleSchedule partagent ScheduleRule::toJSON),
    // donc tout ce qu'il faut est déjà dans this.schedules.
    _openEditScheduleGroup(key, presetTarget, lockedTarget, opts) {
        const isNew = typeof key === 'undefined';

        if (isNew && !presetTarget && !this.hasScheduleTarget()) {
            routeSetEditor('divSomfySchedules', null, { replace: true });
            return ui.infoMessage('SCHEDULE_NO_TARGET_TITLE', 'SCHEDULE_NO_TARGET_MSG');
        }

        // this.maxSchedules vient de /controller (cf. loadSomfy) -- 30 en repli si ce chargement
        // n'a pas encore résolu, pour matcher SOMFY_MAX_SCHEDULES - 2 par défaut sans bloquer l'UI.
        if (isNew && this.schedules && this.schedules.length >= (this.maxSchedules || 30)) {
            routeSetEditor('divSomfySchedules', null, { replace: true });
            return ui.errorMessage(get('divSomfySettings'), tr('ERR_SCHEDULE_LIMIT_REACHED'));
        }

        if (isNew) {
            const targetType = (presetTarget && presetTarget.targetType) || 'shade';
            let targetId = presetTarget ? presetTarget.targetId : undefined;
            if (typeof targetId === 'undefined') {
                const firstShade = (this.shades && this.shades.length > 0) ? this.shades[0] : undefined;
                targetId = firstShade ? firstShade.shadeId : undefined;
            }
            this.ScheduleOverlay({ key: undefined, name: '', targetType, targetId, dayMask: 0, steps: [] }, lockedTarget);
            return;
        }

        const group = this.getScheduleGroup(key);
        if (!group || group.steps.length === 0) {
            routeSetEditor('divSomfySchedules', null, { replace: true });
            return (opts && opts.silentError) ? undefined : ui.errorMessage(get('divSomfySettings'), tr('ERR_SCHEDULE_NOT_FOUND'));
        }
        this.ScheduleOverlay(group, lockedTarget);
    }
    // Détermine si un shadeType donné supporte la position "My" (voir noMyShadeTypes).
    shadeTypeSupportsMy(shadeType) {
        return !this.noMyShadeTypes.includes(shadeType);
    }

    // Copie de travail d'un créneau : l'overlay reconstruit le panneau à chaque changement
    // d'onglet, donc aucune valeur ne peut vivre uniquement dans le DOM. `id` absent = créneau
    // qui n'existe pas encore côté firmware.
    _defaultScheduleStep() {
        return {
            id: undefined, hour: 9, minute: 0, timeRef: 'clock', sunOffset: 0,
            positionMode: 'position', targetPos: 0, targetTilt: -1, retries: 0, enabled: true
        };
    }
    _scheduleStepModel(sc) {
        return {
            id: sc.id,
            hour: sc.hour || 0,
            minute: sc.minute || 0,
            timeRef: (sc.timeRef === 'sunrise' || sc.timeRef === 'sunset') ? sc.timeRef : 'clock',
            sunOffset: sc.sunOffset || 0,
            positionMode: sc.positionMode || 'position',
            targetPos: sc.targetPos || 0,
            targetTilt: (typeof sc.targetTilt === 'number') ? sc.targetTilt : -1,
            retries: sc.retries || 0,
            enabled: (typeof sc.enabled === 'undefined') ? true : makeBool(sc.enabled)
        };
    }
    // Libellé en toutes lettres de l'action d'un horaire, tel qu'il s'affiche sur sa carte dans
    // l'éditeur de programmation. Plus bavard que _scheduleActionText (badge compact des listes) :
    // ici la place ne manque pas et c'est la seule description de l'horaire sous les yeux de
    // l'utilisateur.
    _scheduleActionMain(step) {
        if (step.positionMode === 'my') return tr('SCHEDULE_POS_MY');
        if (step.positionMode === 'tiltonly') return `${tr('SCHEDULE_POS_TILT_ONLY')} ${step.targetTilt} %`;
        if (step.targetPos === 0) return tr('BT_OPEN');
        if (step.targetPos === 100) return tr('BT_CLOSE');
        return `${step.targetPos} %`;
    }
    // Inclinaison demandée EN PLUS d'une position (store vénitien, BSO) : un complément, pas une
    // action à part -- d'où un fragment séparé, que la fiche peut renvoyer à la ligne sur mobile
    // sans couper le libellé principal. Vide en mode MY ou Inclinaison seule, où elle n'a pas de
    // sens ou est déjà dans le libellé.
    //
    // `short` sert aux fiches des listes : "Position d'inclinaison cible" est le libellé du
    // réglage, juste devant son slider dans l'éditeur, mais il occupe à lui seul une ligne entière
    // d'une carte sur mobile.
    _scheduleTiltSuffix(step, short) {
        if (step.positionMode !== 'position' || !(step.targetTilt >= 0)) return '';
        if (short) return tr('SCHEDULE_TILT_SHORT').replace('{tilt}', step.targetTilt);
        return `${tr('SETMYPOS_TARGET_TILT_POS')} ${step.targetTilt} %`;
    }
    _scheduleHourActionLabel(step) {
        const suffix = this._scheduleTiltSuffix(step);
        return this._scheduleActionMain(step) + (suffix ? ` · ${suffix}` : '');
    }
    _scheduleHourIcon(step) {
        if (step.positionMode === 'my') return '#svg-my';
        if (step.positionMode === 'tiltonly') return '#svg-indicblind';
        if (step.targetPos === 0) return '#svg-up';
        if (step.targetPos === 100) return '#svg-down';
        return '#svg-target';
    }
    // Phrase qui décrit l'horaire en clair sous son libellé : c'est elle qui rend la carte lisible
    // sans avoir à décoder un pourcentage. Sans sujet -- la cible est déjà nommée en haut de
    // l'éditeur, la répéter sur chaque carte n'apprenait rien et allongeait la ligne.
    _scheduleHourSummary(step, timeMain) {
        let key = 'SCHEDULE_HOUR_SUMMARY_POS';
        if (step.positionMode === 'my') key = 'SCHEDULE_HOUR_SUMMARY_MY';
        else if (step.positionMode === 'tiltonly') key = 'SCHEDULE_HOUR_SUMMARY_TILT';
        else if (step.targetPos === 0) key = 'SCHEDULE_HOUR_SUMMARY_OPEN';
        else if (step.targetPos === 100) key = 'SCHEDULE_HOUR_SUMMARY_CLOSE';
        return tr(key)
            .replace('{pos}', step.targetPos)
            .replace('{tilt}', step.targetTilt)
            .replace('{time}', timeMain);
    }
    // Une carte par horaire dans l'éditeur de programmation. Le clic ouvre sa modale de réglage,
    // la poubelle le retire du modèle (rien n'est envoyé au firmware avant l'enregistrement de la
    // programmation elle-même).
    _scheduleHourRowHtml(step, index, effectiveMinutes) {
        const timeMain = effectiveMinutes === null ? '--:--' : formatMinutesOfDay(effectiveMinutes).main;
        const isSolar = (step.timeRef === 'sunrise' || step.timeRef === 'sunset');
        // La référence solaire vit dans son propre span : c'est lui qui passe à la ligne sur un
        // écran étroit, plutôt que de laisser la phrase et le décalage se couper n'importe où.
        const summary = `<span>${this._scheduleHourSummary(step, timeMain)}</span>`;
        const detail = isSolar
            ? `${summary}<span class="schedule-hour-trigger">· ${this._scheduleTriggerInfoHtml(step)}</span>`
            : summary;
        const offBadge = step.enabled ? '' : `<span class="schedule-badge-off">${tr('DISABLED_F')}</span>`;
        return `<div class="uniRow schedule-hour-row${step.enabled ? '' : ' is-off'}" data-step="${index}">
        <div class="uniLeft">
        <div class="uniblocSvg-F"><svg><use href="${this._scheduleHourIcon(step)}"></use></svg></div>
        <div class="uniText">
        <div class="uniLabel">${this._scheduleHourActionLabel(step)}${offBadge}</div>
        <div class="uniStatus schedule-hour-time">${detail}</div>
        </div>
        </div>
        <div class="uniRight">
        <div class="divEditDelete-svg" data-delete="1">
        <svg class="icon-svg" style="color: var(--color-danger);"><use href="#svg-trash"></use></svg>
        </div>
        </div>
        </div>`;
    }
    // Éditeur d'une programmation : nom, cible, jours, et la LISTE de ses horaires. Chaque horaire
    // se règle dans sa propre modale (cf. ScheduleHourOverlay) -- l'écran reste donc le même qu'il y
    // ait un horaire ou six, sans mode à choisir ni bascule à comprendre.
    ScheduleOverlay(group, lockedTarget) {
        if (get('divEditScheduleOverlay')) return;

        const isEdit = !!group.key;
        const titleKey = isEdit ? 'SCHEDULE_EDIT_TITLE' : 'SCHEDULE_CREATE_TITLE';
        const descKey = isEdit ? 'SCHEDULE_EDIT_DESC' : 'SCHEDULE_CREATE_DESC';
        const buttonText = isEdit ? tr('BT_SAVE') : tr('BT_CREATE');
        const iconHref = isEdit ? '#svg-save' : '#svg-add';

        // Modèle d'édition : détaché de this.schedules, c'est lui qui fait foi jusqu'à
        // l'enregistrement. `removed` retient les règles à supprimer côté firmware pour que
        // saveSchedule() puisse produire son diff sans relire l'état d'origine. Une NOUVELLE
        // programmation démarre sans aucun horaire : mieux vaut une liste vide qu'un horaire
        // pré-rempli que l'utilisateur enregistrerait sans l'avoir regardé.
        const model = {
            key: group.key,
            name: group.name || '',
            targetType: group.targetType || 'shade',
            targetId: group.targetId,
            dayMask: group.dayMask || 0,
            steps: (group.steps || []).map(({ sc }) => this._scheduleStepModel(sc)),
            removed: []
        };
        this._editScheduleModel = model;

        let div = document.createElement('div');
        div.id = 'divEditScheduleOverlay';
        div.className = 'inst-overlay';
        div.setAttribute('data-groupkey', group.key || '');
        // Toujours renseignés, y compris en mode "cible libre" (ce sont eux qui font foi tant que
        // l'utilisateur n'a pas changé la sélection) : sert de repli dans saveSchedule() quand le
        // sélecteur est verrouillé/absent, et c'est là que ScheduleHourOverlay lit la cible pour
        // savoir quelles actions proposer.
        div.setAttribute('data-targettype', model.targetType);
        div.setAttribute('data-targetid', model.targetId);

        const dayBtn = (bit, key) => `<button type="button" class="schedule-day-btn" data-bit="${bit}" onclick="this.classList.toggle('active'); this.dispatchEvent(new Event('change', {bubbles:true}));">${tr(key)}</button>`;

        // Sélecteur de cible libre (page générale des Plannings) vs. bloc verrouillé (ouvert depuis
        // l'édition d'un équipement/Groupe précis : la cible est déjà imposée par le formulaire parent).
        const targetBlock = lockedTarget ? `
        <div class="uniRow dirty-target">
        <div class="uniblocSvg-S"><svg><use href="#svg-indicShutter"></use></svg></div>
        <div class="unifield-content">
        <label class="label">${tr('SCHEDULE_TARGET')}</label>
        <div class="inputAndSelect schedule-target-locked">${this.scheduleTargetName(model)}</div>
        </div>
        </div>` : `
        <div class="uniRow dirty-target">
        <div class="uniblocSvg-S"><svg><use href="#svg-indicShutter"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="selScheduleTarget">${tr('SCHEDULE_TARGET')}</label>
        <select id="selScheduleTarget" class="inputAndSelect"></select>
        </div>
        </div>`;

        div.innerHTML = `
        <div class="instructions-content">
        ${overlayHeader(titleKey, descKey, 'svg-schedule', { subtitle: descKey, showInfo: false, stateBadge: 'DISABLED_F' })}
        <div class="overlay-scroll-content">
        <input type="hidden" id="fldScheduleStepsDirty">
        <div class="unibloc-container">
        <h3 class="unibloc-title">${tr('GENERAL_INFO')}</h3>
        <div class="uniblocRow">
        <div class="uniRow dirty-target">
        <div class="unifield-content">
        <label class="label" for="fldScheduleName">${tr('NAME')}</label>
        <input id="fldScheduleName" class="inputAndSelect" name="scheduleName" type="text" length="20" placeholder="${tr('SCHEDULE_NAME_PHL')}">
        </div>
        </div>
        ${targetBlock}
        </div>
        </div>
        <div class="unibloc-container dirty-target">
        <div class="schedule-days-header">
        <h3 class="unibloc-title">${tr('SCHEDULE_DAYS')}</h3>
        <button type="button" id="btnScheduleAllDays" class="schedule-alldays-btn">${tr('BT_SELECT_ALL_DAYS')}</button>
        </div>
        <div id="divScheduleDayPicker" class="schedule-day-picker">
        ${dayBtn(2, 'SCHEDULE_MON')}${dayBtn(4, 'SCHEDULE_TUE')}${dayBtn(8, 'SCHEDULE_WED')}${dayBtn(16, 'SCHEDULE_THU')}${dayBtn(32, 'SCHEDULE_FRI')}${dayBtn(64, 'SCHEDULE_SAT')}${dayBtn(1, 'SCHEDULE_SUN')}
        </div>
        </div>
        <div class="unibloc-container">
        <div class="schedule-hours-header">
        <h3 class="unibloc-title">${tr('SCHEDULE_HOURS')}</h3>
        <span class="switch">
        <input id="cbScheduleHoursEnabled" type="checkbox" aria-label="${escAttr(tr('SCHEDULE_HOURS_ENABLE_ALL'))}" data-tooltip-text="${escAttr(tr('SCHEDULE_HOURS_ENABLE_ALL'))}">
        <div></div>
        </span>
        </div>
        <div class="schedule-hour-block">
        <div class="uniRow schedule-add-row marginB" id="rowScheduleAddHour">
        <div class="uniLeft">
        <div class="uniblocSvg-F"><svg><use href="#svg-add"></use></svg></div>
        <div class="uniText"><div class="uniLabel">${tr('SCHEDULE_HOUR_ADD')}</div></div>
        </div>
        <div class="uniRight"><svg class="btnArrowRight"><use href="#svg-arrowRight"></use></svg></div>
        </div>
        <div id="divScheduleHourList"></div>
        </div>
        </div>
        </div>
        <div class="hrDivFooter-Instruc"></div>
        <div class="button-container-overlay">
        <button id="btnScheduleGoBack" line type="button">${tr('BT_CLOSE')}</button>
        <button id="btnSaveSchedule" type="button">
        <svg><use id="useSaveScheduleIcon" href="${iconHref}"></use></svg>
        <span id="btnSaveScheduleText">${buttonText}</span>
        </button>
        </div>
        </div>`;

        shOverlay(div);

        if (!lockedTarget) {
            div._onClosed = () => routeSetEditor('divSomfySchedules', null);
            routeSetEditor('divSomfySchedules', group.key || 'new', { label: isEdit ? this.scheduleGroupLabel(group) : tr('SCHEDULE_CREATE_TITLE') });
            this.populateScheduleTargetSelect(model.targetType, model.targetId);
            div.querySelector('#selScheduleTarget').addEventListener('change', (e) => {
                const [tType, tIdStr] = (e.target.value || '').split(':');
                div.setAttribute('data-targettype', tType);
                div.setAttribute('data-targetid', tIdStr);
            });
        }
        div.querySelector('#fldScheduleName').value = model.name;
        div.querySelectorAll('.schedule-day-btn').forEach(btn => {
            const bit = parseInt(btn.getAttribute('data-bit'), 10);
            btn.classList.toggle('active', (model.dayMask & bit) !== 0);
        });

        const listEl = div.querySelector('#divScheduleHourList');
        const dirtyFlag = div.querySelector('#fldScheduleStepsDirty');
        // Ajouter, régler ou retirer un horaire ne touche aucun champ suivi par watchDirty (tout se
        // passe dans le modèle et dans une modale qui disparaît) : ce témoin caché, lui, vit dans la
        // coque et se nettoie normalement avec clearDirty.
        const markStepsDirty = () => dirtyFlag.classList.add('is-dirty');

        const headerState = div.querySelector('.overlayHeader-state');
        const syncEnabledBadge = () => {
            headerState.style.display = (model.steps.length > 0 && model.steps.some(step => step.enabled)) ? 'none' : '';
        };
        // Interrupteur maître, à droite du titre du bloc : il REFLÈTE l'état des horaires (allumé
        // dès qu'un seul est actif) et, actionné, l'impose à tous. Sans horaire il n'a rien à
        // commander, donc il se grise.
        const hoursSwitch = div.querySelector('#cbScheduleHoursEnabled');
        const syncHoursSwitch = () => {
            hoursSwitch.disabled = model.steps.length === 0;
            hoursSwitch.checked = model.steps.some(step => step.enabled);
        };
        hoursSwitch.addEventListener('change', () => {
            const on = hoursSwitch.checked;
            model.steps.forEach(step => { step.enabled = on; });
            markStepsDirty();
            renderHours();
        });
        // Tri par heure EFFECTIVE du jour, comme les listes : un horaire solaire se range à la place
        // qu'il occupera aujourd'hui.
        const renderHours = () => {
            const sunTimes = this._sunTimesToday();
            const ordered = model.steps
                .map((step, i) => ({ step: step, index: i, eff: this._effectiveMinutesOf(step, sunTimes) }))
                .sort((a, b) => (a.eff ?? 9999) - (b.eff ?? 9999));
            listEl.innerHTML = ordered.map(x => this._scheduleHourRowHtml(x.step, x.index, x.eff)).join('');
            syncEnabledBadge();
            syncHoursSwitch();
        };
        renderHours();

        listEl.addEventListener('click', (e) => {
            const row = e.target.closest('.schedule-hour-row');
            if (!row) return;
            const index = parseInt(row.getAttribute('data-step'), 10);
            if (e.target.closest('[data-delete]')) {
                const removed = model.steps.splice(index, 1)[0];
                if (removed && typeof removed.id !== 'undefined') model.removed.push(removed.id);
                markStepsDirty();
                renderHours();
                return;
            }
            this.ScheduleHourOverlay(index, lockedTarget, () => { markStepsDirty(); renderHours(); });
        });
        div.querySelector('#rowScheduleAddHour').onclick = () => {
            this.ScheduleHourOverlay(undefined, lockedTarget, () => { markStepsDirty(); renderHours(); });
        };

        watchDirty(div);

        // Raccourci "Tous les jours" : bascule les 7 jours ensemble (tout cocher / tout décocher
        // selon l'état actuel), en redéclenchant un `change` par bouton pour le suivi isDirty.
        div.querySelector('#btnScheduleAllDays').onclick = () => {
            const dayBtns = div.querySelectorAll('.schedule-day-btn');
            const allActive = Array.from(dayBtns).every(b => b.classList.contains('active'));
            dayBtns.forEach(b => {
                b.classList.toggle('active', !allActive);
                b.dispatchEvent(new Event('change', { bubbles: true }));
            });
        };

        div.querySelector('#btnScheduleGoBack').onclick = () => requestCloseOverlay(div);
        div.querySelector('#btnSaveSchedule').onclick = () => this.saveSchedule(div);
    }
    // Réglage d'UN horaire, par-dessus l'éditeur de programmation. N'écrit que dans le modèle en
    // mémoire (this._editScheduleModel) : le firmware n'est touché qu'à l'enregistrement de la
    // programmation. D'où le bouton "Confirmer" plutôt qu'"Enregistrer" -- deux "Enregistrer"
    // empilés laisseraient croire que l'horaire est déjà parti dans la box.
    // `index` absent = nouvel horaire.
    ScheduleHourOverlay(index, lockedTarget, onDone) {
        if (get('divEditScheduleHourOverlay')) return;
        const model = this._editScheduleModel;
        if (!model) return;
        const isNew = (typeof index !== 'number');
        const step = isNew ? this._defaultScheduleStep() : Object.assign({}, model.steps[index]);
        if (!step) return;

        const parent = get('divEditScheduleOverlay');
        const targetType = parent ? parent.getAttribute('data-targettype') : model.targetType;
        const targetId = parent ? parseInt(parent.getAttribute('data-targetid'), 10) : model.targetId;

        // geoLat=99 = position non configurée côté firmware (cf. ConfigSettings.h) ; general._geoSettings
        // est peuplé par general.loadGeneral() au démarrage de l'appli (cf. class General).
        const geo = (typeof general !== 'undefined' && general._geoSettings) || {};
        const hasGeo = typeof geo.geoLat === 'number' && geo.geoLat >= -90 && geo.geoLat <= 90;
        const sunTimes = hasGeo ? computeSunUtcMinutes(geo.geoLat, geo.geoLon, new Date()) : null;
        const sunRefSuffix = hasGeo ? '' : ` ${tr('SCHEDULE_SUN_NOT_CONFIGURED_SHORT')}`;

        let div = document.createElement('div');
        div.id = 'divEditScheduleHourOverlay';
        div.className = 'modal-overlay';
        div.innerHTML = `
        <div class="message-content" id="divScheduleHourContent">
        ${modalHeader(isNew ? 'SCHEDULE_HOUR_CREATE_TITLE' : 'SCHEDULE_HOUR_EDIT_TITLE', 'svg-schedule', { subtitle: 'SCHEDULE_HOUR_DESC' })}
        <div class="overlay-scroll-content">
        <div class="unibloc-container">
        <h3 class="unibloc-title">${tr('SCHEDULE_TIME')}</h3>
        <div class="uniRow dirty-target">
        <div class="uniblocSvg-S"><svg><use href="#svg-schedule"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="selScheduleTimeRef">${tr('SCHEDULE_TIME_REF')}</label>
        <select id="selScheduleTimeRef" class="inputAndSelect">
        <option value="clock">${tr('SCHEDULE_TIME_REF_CLOCK')}</option>
        <option value="sunrise">${tr('SCHEDULE_TIME_REF_OPT_SUNRISE')}${sunRefSuffix}</option>
        <option value="sunset">${tr('SCHEDULE_TIME_REF_OPT_SUNSET')}${sunRefSuffix}</option>
        </select>
        </div>
        </div>
        <div id="divScheduleSunGeoHint" class="uniStatus" style="display:none;">${tr('SCHEDULE_SUN_NOT_CONFIGURED')}</div>
        <div id="divScheduleClockTime" class="uniRow dirty-target">
        <div class="uniblocSvg-S"><svg><use href="#svg-schedule"></use></svg></div>
        <div class="unifield-content">
        <input id="fldScheduleTime" class="inputAndSelect" type="time">
        </div>
        </div>
        <div id="divScheduleSunBlock" style="display:none;">
        <div id="divScheduleSunTimeInfo" class="schedule-sun-time-info"></div>
        <label class="uniRow dirty-target" for="cbScheduleSunOffsetEnabled">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg class="svg-mirror-x"><use href="#svg-schedule"></use></svg></div>
        <div class="uniText"><div class="uniLabel">${tr('SCHEDULE_SUN_OFFSET_ENABLE')}</div></div>
        </div>
        <div class="uniRight">
        <span class="switch">
        <input id="cbScheduleSunOffsetEnabled" type="checkbox">
        <div></div>
        </span>
        </div>
        </label>
        <div id="divScheduleSunOffsetBlock" style="display:none;">
        <div class="schedule-sun-offset-row">
        <div class="slider-wrapper schedule-sun-offset-slider dirty-target">
        <div class="slider-progress"><div class="slider-thumb-line"></div></div>
        <input id="slidScheduleSunOffset" class="md3-range-input" type="range" min="-720" max="720" step="1" value="0">
        </div>
        <div class="schedule-sun-offset-field dirty-target">
        <input id="inputScheduleSunOffset" class="schedule-sun-offset-number" type="number" min="-720" max="720" step="1" value="0">
        <span class="schedule-sun-offset-unit">${tr('SCHEDULE_SUN_OFFSET_UNIT')}</span>
        </div>
        </div>
        <div id="divScheduleSunOffsetSummary" class="uniStatus"></div>
        </div>
        </div>
        </div>
        <div class="unibloc-container">
        <h3 class="unibloc-title">${tr('IS_POSITION')}</h3>
        <div class="schedule-position-quick">
        <button type="button" id="btnSchedulePosOpen" class="schedule-quickpos-btn"><svg><use href="#svg-up"></use></svg><span>${tr('BT_OPEN')}</span></button>
        <button type="button" id="btnSchedulePosClose" class="schedule-quickpos-btn"><svg><use href="#svg-down"></use></svg><span>${tr('BT_CLOSE')}</span></button>
        <button type="button" id="btnSchedulePosCustom" class="schedule-quickpos-btn"><svg><use href="#svg-target"></use></svg><span>${tr('SCHEDULE_POS_CUSTOM')}</span></button>
        <button type="button" id="btnSchedulePosTiltOnly" class="schedule-quickpos-btn" style="display:none;"><svg><use href="#svg-indicblind"></use></svg><span>${tr('SCHEDULE_POS_TILT_ONLY')}</span></button>
        <button type="button" id="btnSchedulePosMy" class="schedule-quickpos-btn"><svg><use href="#svg-my"></use></svg><span>${tr('SCHEDULE_POS_MY')}</span></button>
        </div>
        <div id="divScheduleMyGroupNote" class="uniStatus schedule-my-note" style="display:none;"></div>
        <input type="hidden" id="fldSchedulePositionMode" value="position">
        <div id="divScheduleSliderGroup" class="slider-group">
        <div class="slider-header"><span class="title">${tr('SETMYPOS_TARGET_POS')}</span><span class="val"><span id="spanScheduleTargetPos">0</span> %</span></div>
        <div class="slider-wrapper">
        <div class="slider-progress"><div class="slider-thumb-line"></div></div>
        <input id="slidScheduleTargetPos" class="md3-range-input" type="range" min="0" max="100" step="1" value="0" oninput="syncSliderProgress(this); get('spanScheduleTargetPos').innerText = this.value;">
        </div>
        </div>
        <div id="divScheduleTiltSliderGroup" class="slider-group" style="display:none;">
        <div class="slider-header"><span class="title">${tr('SETMYPOS_TARGET_TILT_POS')}</span><span class="val"><span id="spanScheduleTargetTilt">0</span> %</span></div>
        <div class="slider-wrapper">
        <div class="slider-progress"><div class="slider-thumb-line"></div></div>
        <input id="slidScheduleTargetTilt" class="md3-range-input" type="range" min="0" max="100" step="1" value="0" oninput="syncSliderProgress(this); get('spanScheduleTargetTilt').innerText = this.value;">
        </div>
        </div>
        </div>
        <div class="unibloc-container">
        <h3 class="unibloc-title">${tr('OPTION')}</h3>
        <div class="uniRow dirty-target">
        <div class="uniblocSvg-S"><svg><use href="#svg-repeat"></use></svg></div>
        <div class="unifield-content">
        <label class="label" for="selScheduleRetries">${tr('REPEAT_COMMANDS')}</label>
        <select id="selScheduleRetries" class="inputAndSelect">
        ${[0,1,2,3,4,5,6,7,8,9,10].map(n => `<option value="${n}">${tr(n === 0 ? 'OPT_NO_REPEAT' : 'OPT_' + n + 'TIME')}</option>`).join('')}
        </select>
        </div>
        </div>
        <label class="uniRow dirty-target" for="cbScheduleEnabled">
        <div class="uniLeft">
        <div class="uniblocSvg-S"><svg><use href="#svg-schedule"></use></svg></div>
        <div class="uniText">
        <div class="uniLabel">${tr('SCHEDULE_HOUR_ENABLED')}</div>
        <div class="uniStatus">${tr('SCHEDULE_ENABLED_DESC')}</div>
        </div>
        </div>
        <div class="uniRight">
        <span class="switch">
        <input id="cbScheduleEnabled" type="checkbox" checked/>
        <div></div>
        </span>
        </div>
        </label>
        </div>
        </div>
        <div class="hrModal margin0"></div>
        <div class="button-container-modal">
        <div class="button-content-modal">
        <button id="btnScheduleHourCancel" line type="button">${tr('BT_CANCEL')}</button>
        <button id="btnScheduleHourConfirm" type="button">
        <svg><use href="#svg-check"></use></svg>
        <span>${tr('BT_CONFIRM')}</span>
        </button>
        </div>
        </div>
        </div>`;

        get('divContainer').appendChild(div);
        shOverlay(div);

        const clockRow = div.querySelector('#divScheduleClockTime');
        const sunBlock = div.querySelector('#divScheduleSunBlock');
        const sunTimeInfo = div.querySelector('#divScheduleSunTimeInfo');
        const sunGeoHint = div.querySelector('#divScheduleSunGeoHint');
        const offsetToggle = div.querySelector('#cbScheduleSunOffsetEnabled');
        const offsetBlock = div.querySelector('#divScheduleSunOffsetBlock');
        const offsetSlider = div.querySelector('#slidScheduleSunOffset');
        const offsetNumber = div.querySelector('#inputScheduleSunOffset');
        const offsetSummary = div.querySelector('#divScheduleSunOffsetSummary');
        const timeRefSelect = div.querySelector('#selScheduleTimeRef');

        timeRefSelect.value = step.timeRef;
        div.querySelector('#fldScheduleTime').value =
            `${step.hour.toString().padStart(2, '0')}:${step.minute.toString().padStart(2, '0')}`;
        offsetSlider.value = step.sunOffset;
        offsetNumber.value = step.sunOffset;
        offsetToggle.checked = step.sunOffset !== 0;
        syncSliderProgress(offsetSlider);

        const currentPhase = () => timeRefSelect.value === 'sunset' ? 'sunset' : 'sunrise';
        const updateSunTimeInfo = () => {
            if (!sunTimes) {
                sunTimeInfo.textContent = tr('SCHEDULE_SUN_NO_EVENT_TODAY');
            } else {
                const isRise = currentPhase() === 'sunrise';
                const utcMinutes = isRise ? sunTimes.sunriseUtcMinutes : sunTimes.sunsetUtcMinutes;
                const key = isRise ? 'SCHEDULE_SUN_TIME_SUNRISE_TODAY' : 'SCHEDULE_SUN_TIME_SUNSET_TODAY';
                sunTimeInfo.textContent = tr(key).replace('{time}', formatSunTime(utcMinutes));
            }
        };
        const updateOffsetSummary = () => {
            if (!sunTimes) { offsetSummary.textContent = ''; return; }
            const isRise = currentPhase() === 'sunrise';
            const phaseNoun = tr(isRise ? 'SCHEDULE_SUN_PHASE_SUNRISE_NOUN' : 'SCHEDULE_SUN_PHASE_SUNSET_NOUN');
            const baseUtc = isRise ? sunTimes.sunriseUtcMinutes : sunTimes.sunsetUtcMinutes;
            const minutes = parseInt(offsetNumber.value, 10) || 0;
            const resultTime = formatSunTime(baseUtc + minutes);
            let key = 'SCHEDULE_SUN_OFFSET_SUMMARY_NONE';
            if (minutes > 0) key = 'SCHEDULE_SUN_OFFSET_SUMMARY_AFTER';
            else if (minutes < 0) key = 'SCHEDULE_SUN_OFFSET_SUMMARY_BEFORE';
            offsetSummary.textContent = tr(key)
                .replace('{minutes}', Math.abs(minutes))
                .replace('{phase}', phaseNoun)
                .replace('{time}', resultTime);
        };
        const syncModeUI = () => {
            const isClock = timeRefSelect.value === 'clock';
            clockRow.style.display = isClock ? '' : 'none';
            sunBlock.style.display = (isClock || !hasGeo) ? 'none' : '';
            sunGeoHint.style.display = (isClock || hasGeo) ? 'none' : '';
            if (!isClock && hasGeo) { updateSunTimeInfo(); updateOffsetSummary(); }
        };
        const syncOffsetUI = () => {
            offsetBlock.style.display = offsetToggle.checked ? '' : 'none';
            if (!offsetToggle.checked) {
                offsetNumber.value = 0;
                offsetSlider.value = 0;
                syncSliderProgress(offsetSlider);
            }
            updateOffsetSummary();
        };
        syncModeUI();
        syncOffsetUI();
        timeRefSelect.addEventListener('change', syncModeUI);
        offsetToggle.addEventListener('change', syncOffsetUI);
        offsetSlider.addEventListener('input', () => {
            offsetNumber.value = offsetSlider.value;
            offsetNumber.dispatchEvent(new Event('change', { bubbles: true }));
            syncSliderProgress(offsetSlider);
            updateOffsetSummary();
        });
        offsetNumber.addEventListener('input', () => {
            let v = parseInt(offsetNumber.value, 10);
            if (isNaN(v)) return;
            v = Math.min(720, Math.max(-720, v));
            offsetSlider.value = v;
            offsetSlider.dispatchEvent(new Event('change', { bubbles: true }));
            syncSliderProgress(offsetSlider);
            updateOffsetSummary();
        });

        div.querySelector('#slidScheduleTargetPos').value = step.targetPos;
        div.querySelector('#spanScheduleTargetPos').innerText = step.targetPos;
        syncSliderProgress(div.querySelector('#slidScheduleTargetPos'));
        const initialTilt = step.targetTilt >= 0 ? step.targetTilt : 0;
        div.querySelector('#slidScheduleTargetTilt').value = initialTilt;
        div.querySelector('#spanScheduleTargetTilt').innerText = initialTilt;
        syncSliderProgress(div.querySelector('#slidScheduleTargetTilt'));

        div.querySelector('#cbScheduleEnabled').checked = step.enabled;
        div.querySelector('#selScheduleRetries').value = step.retries;

        // Trois modes d'action côté firmware, mutuellement exclusifs : Position (& Tilt le cas
        // échéant), Tilt seul (ajuste uniquement l'inclinaison, hauteur inchangée -- utile pour un
        // store vénitien/BSO qu'on veut juste réorienter en cours de journée) et MY (vraie commande
        // RTS "My", reste à jour si l'utilisateur redéfinit sa position favorite plus tard). "Tilt
        // seul" et le slider Tilt en mode Position ne sont proposés que si la cible gère réellement
        // l'inclinaison (cf. updateModeAvailability).
        let targetSupportsTilt = false;
        // CÔTÉ INTERFACE, le mode "position" se décline en trois choix distincts pour l'utilisateur
        // (Ouvrir = 0 %, Fermer = 100 %, Personnalisée = slider) : posChoice porte ce niveau de
        // détail, #fldSchedulePositionMode reste la valeur envoyée au firmware.
        let posChoice = 'open';
        const isPositionChoice = c => c === 'open' || c === 'close' || c === 'custom';
        const posChoiceButtons = {
            open: '#btnSchedulePosOpen', close: '#btnSchedulePosClose', custom: '#btnSchedulePosCustom',
            tiltonly: '#btnSchedulePosTiltOnly', my: '#btnSchedulePosMy'
        };
        const updateSliderVisibility = () => {
            // Le slider de position n'a de sens qu'en "Personnalisée" : Ouvrir/Fermer fixent déjà
            // 0/100 %. Le slider Tilt, lui, reste pertinent pour TOUT choix de position sur une
            // cible inclinable.
            div.querySelector('#divScheduleSliderGroup').style.display = (posChoice === 'custom') ? '' : 'none';
            div.querySelector('#divScheduleTiltSliderGroup').style.display =
                (posChoice === 'tiltonly' || (isPositionChoice(posChoice) && targetSupportsTilt)) ? '' : 'none';
        };
        let groupMyIncompatible = false, groupTiltIncompatible = false;
        const updateIncompatibilityNote = () => {
            const mode = div.querySelector('#fldSchedulePositionMode').value;
            const note = div.querySelector('#divScheduleMyGroupNote');
            if (mode === 'my' && groupMyIncompatible) {
                note.innerText = tr('SCHEDULE_MY_GROUP_NOTE');
                note.style.display = '';
            } else if (mode === 'tiltonly' && groupTiltIncompatible) {
                note.innerText = tr('SCHEDULE_TILT_GROUP_NOTE');
                note.style.display = '';
            } else {
                note.style.display = 'none';
            }
        };
        const setPosChoice = (choice, markDirty) => {
            posChoice = choice;
            const hidden = div.querySelector('#fldSchedulePositionMode');
            hidden.value = isPositionChoice(choice) ? 'position' : choice;
            Object.entries(posChoiceButtons).forEach(([key, sel]) => {
                div.querySelector(sel).classList.toggle('active', key === choice);
            });
            // Ouvrir/Fermer : le slider (masqué) reste la source de vérité de targetPos, on
            // l'aligne donc sur le choix. Convention de l'appli : 0 % = ouvert, 100 % = fermé.
            if (choice === 'open' || choice === 'close') {
                const slider = div.querySelector('#slidScheduleTargetPos');
                slider.value = (choice === 'open') ? 0 : 100;
                div.querySelector('#spanScheduleTargetPos').innerText = slider.value;
                syncSliderProgress(slider);
            }
            updateSliderVisibility();
            updateIncompatibilityNote();
            if (markDirty) hidden.dispatchEvent(new Event('change', { bubbles: true }));
        };
        // Reconstitution du choix affiché depuis les données enregistrées : le firmware ne stocke
        // que positionMode + targetPos, "Ouvrir"/"Fermer"/"Personnalisée" s'en déduisent.
        setPosChoice(
            step.positionMode === 'my' ? 'my'
                : step.positionMode === 'tiltonly' ? 'tiltonly'
                    : step.targetPos === 100 ? 'close'
                        : (step.targetPos ? 'custom' : 'open'),
            false);

        // Cas particulier tilt_types::tiltonly (BSO à lames seules) : SomfyShade::moveToTarget
        // force alors pos = 100 et pilote UNIQUEMENT par l'inclinaison, la hauteur demandée n'est
        // jamais transmise -- on ne laisse donc que "Inclinaison seule" (et MY).
        const TILT_TYPE_TILTONLY = 3;
        const positionBtns = ['open', 'close', 'custom'].map(k => div.querySelector(posChoiceButtons[k]));
        let supportsMy = true;
        let targetIsTiltOnly = false;
        // Contacts secs : pas de pourcentage à viser, seulement un état. Un GROUPE n'est pas
        // concerné même s'il n'a que des membres contact sec -- SomfyGroup::moveToTarget délègue à
        // chaque membre, dont le garde ramène la consigne à son état binaire.
        let dryContact1 = false, dryContact2 = false;
        if (targetType === 'group') {
            const grp = (this.groups || []).find(g => g.groupId === targetId);
            const linked = (grp && grp.linkedShades) || [];
            groupMyIncompatible = linked.some(s => this.noMyShadeTypes.includes(s.shadeType));
            targetSupportsTilt = linked.some(ls => {
                const full = (this.shades || []).find(s => s.shadeId === ls.shadeId);
                return full && full.tiltType > 0;
            });
            groupTiltIncompatible = targetSupportsTilt && linked.some(ls => {
                const full = (this.shades || []).find(s => s.shadeId === ls.shadeId);
                return !full || !(full.tiltType > 0);
            });
            // Un groupe n'est "inclinaison seule" que si TOUS ses membres le sont.
            targetIsTiltOnly = linked.length > 0 && linked.every(ls => {
                const full = (this.shades || []).find(s => s.shadeId === ls.shadeId);
                return full && full.tiltType === TILT_TYPE_TILTONLY;
            });
        } else {
            let shadeType, tiltType;
            if (lockedTarget) {
                // Ouvert depuis editShade : ce formulaire est forcément affiché derrière ces deux
                // overlays. On lit ses valeurs EN DIRECT plutôt que le cache somfy.shades, qui ne
                // sera à jour qu'après un "Enregistrer" explicite.
                const typeEl = get('selShadeType');
                if (typeEl) {
                    shadeType = parseInt(typeEl.value, 10);
                    const st = this.shadeTypes.find(x => x.type === shadeType);
                    const tiltEl = get('selTiltType');
                    tiltType = (st && st.tilt && tiltEl) ? parseInt(tiltEl.value, 10) : 0;
                }
            }
            if (typeof shadeType === 'undefined') {
                const shade = (this.shades || []).find(s => s.shadeId === targetId);
                shadeType = shade ? shade.shadeType : undefined;
                tiltType = shade ? shade.tiltType : 0;
            }
            supportsMy = (typeof shadeType === 'undefined') ? true : this.shadeTypeSupportsMy(shadeType);
            targetSupportsTilt = !!(tiltType > 0);
            targetIsTiltOnly = (tiltType === TILT_TYPE_TILTONLY);
            dryContact1 = (shadeType === 9);
            dryContact2 = (shadeType === 10);
        }
        const myBtn = div.querySelector('#btnSchedulePosMy');
        const tiltOnlyBtn = div.querySelector('#btnSchedulePosTiltOnly');
        // Contact sec 1 bouton : une impulsion, rien d'autre -- un seul choix, à l'image de
        // l'équipement. C'est le mode `my` qui le porte : ScheduleController appelle alors
        // sendCommand(My), que SomfyDispatch fait basculer. Un mode `position` passerait par
        // moveToTarget, dont le garde contact sec n'émet précisément rien quand l'état demandé est
        // déjà le bon -- correct pour une consigne d'état, mais ce n'est pas ce qu'on veut dire
        // ici. On réétiquette le bouton MY plutôt que d'en ajouter un sixième : il porte déjà la
        // bonne écriture, et supportsMy vaut faux pour ce type (aucune position favorite) sans que
        // cela retire le sens de la commande.
        // Contact sec 2 boutons : deux ordres distincts, donc Ouvrir/Fermer réétiquetés en
        // Arrêt/Marche -- les valeurs sont déjà les bonnes, 0 % ouvre le relais et 100 % le ferme.
        // Dans les deux cas, ni Personnalisée ni curseur : un relais ne connaît pas les 60 %.
        const relabel = (btn, cle, icone) => {
            const span = btn.querySelector('span'), use = btn.querySelector('use');
            if (span) { span.setAttribute('tr', cle); span.innerText = tr(cle); }
            if (use && icone) use.setAttribute('href', icone);
        };
        if (dryContact1) {
            relabel(myBtn, 'VR_TOGGLE', '#svg-toggle');
            supportsMy = true;
        }
        else if (dryContact2) {
            relabel(div.querySelector(posChoiceButtons.open), 'IS_OFF');
            relabel(div.querySelector(posChoiceButtons.close), 'IS_ON');
        }
        myBtn.style.display = supportsMy ? '' : 'none';
        myBtn.disabled = !supportsMy;
        tiltOnlyBtn.style.display = targetSupportsTilt ? '' : 'none';
        tiltOnlyBtn.disabled = !targetSupportsTilt;
        positionBtns.forEach(btn => {
            const off = targetIsTiltOnly || dryContact1
                || (dryContact2 && btn === div.querySelector(posChoiceButtons.custom));
            btn.style.display = off ? 'none' : '';
            btn.disabled = off;
        });
        const choiceUnavailable = (!supportsMy && posChoice === 'my')
            || (!targetSupportsTilt && posChoice === 'tiltonly')
            || (targetIsTiltOnly && isPositionChoice(posChoice))
            || (dryContact1 && posChoice !== 'my')
            || (dryContact2 && (posChoice === 'my' || posChoice === 'custom'));
        // La cible ne supporte pas le choix enregistré : repli sur le seul dont elle est certainement
        // capable.
        if (choiceUnavailable) setPosChoice(dryContact1 ? 'my' : targetIsTiltOnly ? 'tiltonly' : 'open', false);
        else { updateSliderVisibility(); updateIncompatibilityNote(); }

        // Les cinq boutons passent par le même point d'entrée : un clic = un choix, jamais deux
        // allumés à la fois.
        Object.entries(posChoiceButtons).forEach(([choice, sel]) => {
            div.querySelector(sel).onclick = () => setPosChoice(choice, true);
        });

        watchDirty(div);

        const readHour = () => {
            const [hourStr, minuteStr] = (div.querySelector('#fldScheduleTime').value || '00:00').split(':');
            step.hour = parseInt(hourStr, 10) || 0;
            step.minute = parseInt(minuteStr, 10) || 0;
            step.timeRef = timeRefSelect.value || 'clock';
            step.sunOffset = offsetToggle.checked ? (parseInt(offsetNumber.value, 10) || 0) : 0;
            step.positionMode = div.querySelector('#fldSchedulePositionMode').value || 'position';
            step.targetPos = parseInt(div.querySelector('#slidScheduleTargetPos').value, 10) || 0;
            // -1 = non applicable (cf. Schedule.h) : cible sans tilt, ou slider masqué (mode MY, où
            // la commande gère sa propre inclinaison mémorisée) -- on ne retient une valeur que si
            // le slider Tilt était réellement visible.
            const tiltGroup = div.querySelector('#divScheduleTiltSliderGroup');
            step.targetTilt = (tiltGroup && tiltGroup.style.display !== 'none')
                ? parseInt(div.querySelector('#slidScheduleTargetTilt').value, 10)
                : -1;
            step.retries = parseInt(div.querySelector('#selScheduleRetries').value, 10) || 0;
            step.enabled = div.querySelector('#cbScheduleEnabled').checked;
        };

        div.querySelector('#btnScheduleHourCancel').onclick = () => requestCloseOverlay(div);
        div.querySelector('#btnScheduleHourConfirm').onclick = () => {
            readHour();
            // Deux horaires au même déclenchement sont deux ordres contradictoires à la même minute :
            // le firmware les exécuterait tous les deux et le dernier gagnerait. Le contrôle vit ici,
            // là où la saisie vient d'être faite, plutôt qu'au moment d'enregistrer la programmation.
            const timeKeyOf = (s) => s.timeRef === 'clock' ? `c${s.hour}:${s.minute}` : `${s.timeRef}${s.sunOffset}`;
            const clash = model.steps.some((other, i) => i !== index && timeKeyOf(other) === timeKeyOf(step));
            if (clash) {
                const eff = this._effectiveMinutesOf(step, sunTimes);
                return ui.errorMessage(tr('ERR_SCHEDULE_HOUR_DUPLICATE').replace('{time}', eff === null ? '--:--' : formatMinutesOfDay(eff).main));
            }
            if (isNew) model.steps.push(step);
            else model.steps[index] = step;
            clearDirty(div);
            closeOverlay(div);
            if (typeof onDone === 'function') onDone();
        };
    }
    // Enregistre la FICHE entière : le firmware ne connaît que des règles ponctuelles, donc un
    // enregistrement se traduit par un diff -- suppressions retenues pendant l'édition, créations
    // pour les créneaux sans identifiant, mises à jour pour les autres. Le nom, les jours et la
    // cible sont communs et donc réécrits sur chaque règle de la fiche (cf. groupKeyOf : ce sont
    // eux qui portent l'appartenance au groupe).
    saveSchedule(overlayEl) {
        if (!overlayEl) overlayEl = get('divEditScheduleOverlay');
        if (!overlayEl) return;
        const model = this._editScheduleModel;
        if (!model) return;
        if (model.steps.length === 0) return ui.errorMessage(tr('ERR_SCHEDULE_NO_HOUR'));

        let dayMask = 0;
        overlayEl.querySelectorAll('.schedule-day-btn.active').forEach(btn => {
            dayMask |= parseInt(btn.getAttribute('data-bit'), 10);
        });

        // Cible verrouillée (ouvert depuis un équipement/Groupe) : pas de sélecteur, on retombe sur les
        // data-attributes posés à la construction de l'overlay (cf. ScheduleOverlay).
        const targetSel = overlayEl.querySelector('#selScheduleTarget');
        let targetType, targetId;
        if (targetSel) {
            const targetVal = targetSel.value || '';
            [targetType, targetId] = targetVal.split(':');
            targetId = parseInt(targetId, 10);
        } else {
            targetType = overlayEl.getAttribute('data-targettype');
            targetId = parseInt(overlayEl.getAttribute('data-targetid'), 10);
        }

        const checks = [
            [dayMask === 0, 'ERR_SCHEDULE_NO_DAYS'],
            [!targetType || isNaN(targetId), 'ERR_SCHEDULE_NO_TARGET']
        ];
        const error = checks.find(c => c[0]);
        if (error) return ui.errorMessage(tr(error[1]));

        model.name = overlayEl.querySelector('#fldScheduleName').value || '';
        model.dayMask = dayMask;
        model.targetType = targetType;
        model.targetId = targetId;

        // Deux créneaux réglés sur le même déclenchement sont deux ordres contradictoires à la même
        // minute : le firmware les exécuterait tous les deux (chaque règle a son propre
        // lastTriggeredMinuteKey), dans l'ordre des emplacements, et le dernier gagnerait. La
        // comparaison porte sur la DÉFINITION, pas sur l'heure effective du jour : 18:03 en heure
        // fixe et "coucher - 2 h" tombent au même moment aujourd'hui seulement.
        const timeKeyOf = (step) => step.timeRef === 'clock'
            ? `c${step.hour}:${step.minute}`
            : `${step.timeRef}${step.sunOffset}`;
        const seenTimes = new Set();
        const duplicate = model.steps.find(step => {
            const k = timeKeyOf(step);
            if (seenTimes.has(k)) return true;
            seenTimes.add(k);
            return false;
        });
        if (duplicate) {
            const eff = this._effectiveMinutesOf(duplicate, this._sunTimesToday());
            const label = eff === null ? '--:--' : formatMinutesOfDay(eff).main;
            return ui.errorMessage(tr('ERR_SCHEDULE_HOUR_DUPLICATE').replace('{time}', label));
        }

        // Le quota se compte en CRÉNEAUX : une fiche à deux créneaux occupe deux des emplacements
        // du firmware. Les règles de la fiche en cours sont retirées du total avant d'y ajouter ce
        // que l'enregistrement va poser, sinon agrandir une fiche existante paraîtrait toujours
        // dépasser.
        const groupRuleCount = model.key
            ? (this.schedules || []).filter(sc => this.groupKeyOf(sc) === model.key).length
            : 0;
        const totalAfter = (this.schedules || []).length - groupRuleCount + model.steps.length;
        if (totalAfter > (this.maxSchedules || 30)) return ui.errorMessage(tr('ERR_SCHEDULE_LIMIT_REACHED'));

        const bodyOf = (step) => ({
            name: model.name,
            dayMask: model.dayMask,
            hour: step.hour,
            minute: step.minute,
            targetType: model.targetType,
            targetId: model.targetId,
            targetPos: step.targetPos,
            targetTilt: step.targetTilt,
            positionMode: step.positionMode,
            enabled: step.enabled,
            retries: step.retries,
            timeRef: step.timeRef,
            sunOffset: step.sunOffset
        });
        // Une règle inchangée n'est pas réécrite : chaque /saveSchedule commit schedules.cfg, et
        // rien ne justifie d'user la flash pour les créneaux auxquels l'utilisateur n'a pas touché.
        const unchanged = (step, body) => {
            const cur = (this.schedules || []).find(x => x.id === step.id);
            if (!cur) return false;
            const curRef = (cur.timeRef === 'sunrise' || cur.timeRef === 'sunset') ? cur.timeRef : 'clock';
            return (cur.name || '') === body.name && (cur.dayMask || 0) === body.dayMask
                && (cur.hour || 0) === body.hour && (cur.minute || 0) === body.minute
                && cur.targetType === body.targetType && cur.targetId === body.targetId
                && (cur.targetPos || 0) === body.targetPos && cur.targetTilt === body.targetTilt
                && (cur.positionMode || 'position') === body.positionMode
                && makeBool(cur.enabled) === body.enabled && (cur.retries || 0) === body.retries
                && curRef === body.timeRef && (cur.sunOffset || 0) === body.sunOffset;
        };

        const ops = model.removed.map(id => ({ url: '/deleteSchedule', body: { id: id } }));
        model.steps.forEach(step => {
            const body = bodyOf(step);
            if (typeof step.id === 'undefined') ops.push({ url: '/addSchedule', body: body });
            else if (!unchanged(step, body)) ops.push({ url: '/saveSchedule', body: Object.assign({ id: step.id }, body) });
        });

        const isNew = !model.key;
        if (ops.length === 0) {
            clearDirty(overlayEl);
            closeOverlay(overlayEl);
            return;
        }
        const run = () => this._runScheduleOps(ops, (err) => {
            if (err) {
                // Arrêt en cours de route : une partie des règles est passée, l'autre non. On
                // recharge avant de signaler, pour que l'écran montre l'état réel du firmware.
                this.updateScheduleList(() => this.refreshOpenTargetScheduleBadges());
                return ui.serviceError(err);
            }
            ui.successMessage(tr(isNew ? 'MSG_ADD_SUCCESS' : 'MSG_SAVE_SUCCESS'));
            clearDirty(overlayEl);
            this.updateScheduleList(() => this.refreshOpenTargetScheduleBadges());
            closeOverlay(overlayEl);
        });

        // Changer la cible ou les jours déplace la fiche vers une autre clé (cf. groupKeyOf) : si
        // cette clé est déjà occupée, les deux fiches n'en feront plus qu'une au prochain
        // chargement. C'est inévitable avec une clé dérivée, mais ça ne doit pas se produire dans
        // le dos de l'utilisateur.
        const newKey = this.groupKeyOf({ targetType: model.targetType, targetId: model.targetId, dayMask: model.dayMask });
        const existing = (newKey !== model.key) ? this.getScheduleGroup(newKey) : null;
        if (!existing) return run();
        let prompt = ui.promptMessage(tr('PROMPT_SCHEDULE_MERGE'), () => {
            prompt.remove();
            run();
        });
        const mergeMsg = prompt.querySelector('.sub-message');
        if (mergeMsg) {
            mergeMsg.innerHTML = `<p>${tr('PROMPT_SCHEDULE_MERGE_CONFIRM')
                .replace('{target}', this.scheduleTargetName(model))
                .replace('{n}', existing.steps.length + model.steps.length)}</p>`;
        }
    }
    // Enchaîne des requêtes de planning une par une, en s'arrêtant à la première erreur : une fiche
    // porte N règles côté firmware (cf. _groupSchedules) et chaque appel écrit schedules.cfg, donc
    // les lancer en parallèle exposerait le fichier à N écritures concurrentes. `done` reçoit
    // l'erreur éventuelle, à charge de l'appelant de recharger la liste dans tous les cas : après
    // un arrêt en cours de route, l'écran ne reflète plus l'état réel du firmware.
    _runScheduleOps(ops, done) {
        const next = (i) => {
            if (i >= ops.length) return done(null);
            putJSONSync(ops[i].url, ops[i].body, (err) => {
                if (err) return done(err);
                next(i + 1);
            });
        };
        next(0);
    }
    scheduleGroupTimesText(group) {
        return group.steps
            .map(({ effectiveMinutes }) => formatMinutesOfDay(effectiveMinutes).main)
            .join(' · ');
    }
    // Interrupteur de la fiche, à côté de la poubelle. Contrairement à l'éditeur, il n'y a pas de
    // bouton "Enregistrer" derrière : la bascule part immédiatement dans le firmware, une requête
    // par horaire à changer. Pas de confirmation -- un second clic remet tout en place, ce que la
    // poubelle voisine, elle, ne permet pas.
    toggleScheduleGroup(key, enabled) {
        const group = this.getScheduleGroup(key);
        if (!group) return;
        const ops = group.steps
            .filter(({ sc }) => makeBool(sc.enabled) !== enabled)
            .map(({ sc }) => ({ url: '/saveSchedule', body: Object.assign({}, sc, { enabled: enabled }) }));
        if (ops.length === 0) return;
        this._runScheduleOps(ops, (err) => {
            if (err) ui.serviceError(err);
            this.updateScheduleList(() => this.refreshOpenTargetScheduleBadges());
        });
    }
    deleteScheduleGroup(key) {
        const group = this.getScheduleGroup(key);
        if (!group) return;
        const desc = `${this.scheduleGroupTimesText(group)} - ${this.scheduleTargetName(group)}`;
        let prompt = ui.promptMessage(tr('PROMPT_DELETE_SCHEDULE'), () => {
            const ops = group.steps.map(({ sc }) => ({ url: '/deleteSchedule', body: { id: sc.id } }));
            this._runScheduleOps(ops, (err) => {
                if (err) ui.serviceError(err);
                this.updateScheduleList(() => this.refreshOpenTargetScheduleBadges());
                prompt.remove();
            });
        });
        const subMsg = prompt.querySelector('.sub-message');
        if (subMsg) subMsg.innerHTML = `<p>${tr('PROMPT_DELETE_SCHEDULE_CONFIRM').replace('{SCHEDULE_DESC}', desc)}</p>`;
    }
}
for (const k of Object.getOwnPropertyNames(_SomfySchedule.prototype)) {
    if (k !== 'constructor') Somfy.prototype[k] = _SomfySchedule.prototype[k];
}
