# Série de jours : correctif du Worker `relink-auth` (version déjà en place)

Le Worker a sa propre série (`rlRecordPlaySignal`, `rlAdvanceStreak`, gels, paliers, partage). Deux défauts :

1. **Le jour ne peut jamais être validé.** Dans `rlRecordPlaySignal`, le temps du jour est remis à zéro à chaque
   signal tant que le jour n'est pas validé (il est lu seulement si `last_valid_date` = aujourd'hui) : il ne
   dépasse jamais ~75 s, les 15 minutes ne sont jamais atteintes.
2. **`GET /launcher/quests` ne donne pas l'état de la série** (`status`), et le temps du jour y vaut 0 tant que
   le jour n'est pas validé : le launcher n'affiche ni la barre « x min / 15 min », ni le message d'état.
   (Le launcher 2.0.30+ déduit l'état lui-même, mais le temps du jour doit venir du Worker.)

Rien à créer dans D1 : le correctif lit la table `streak_activity` qui existe déjà.

## 1. `rlRecordPlaySignal` — le temps du jour s'additionne

Cherche :

```js
  const today = row?.last_valid_date === date ? Number(row?.playtime_seconds_today || 0) : 0;
```

Remplace par :

```js
  // temps du jour : accumulé depuis minuit (heure de Paris), que le jour soit déjà validé ou non
  const sameDay = !!prev && rlParisDate(Number(prev.last_signal_at)) === date;
  const today = sameDay ? Number(row?.playtime_seconds_today || 0) : 0;
```

## 2. `handleLauncherQuests` — état de la série et temps du jour

Cherche (dans `handleLauncherQuests`, juste après `const cfg = await getStreakConfig(env);`) tout le bloc qui va de :

```js
      const current = st?.current_streak || 0;
```

jusqu'à (inclus) :

```js
        milestones: RL_STREAK.milestones.map(([day, bonus]) => ({ day, bonus })) };
```

Remplace tout ce bloc par :

```js
      const todayDate = rlParisDate();
      const act = await env.relinkdb.prepare('SELECT last_signal_at FROM streak_activity WHERE discord_id = ?').bind(id).first().catch(() => null);
      const lastValid = st?.last_valid_date || null;
      const freezes = Number(freeze?.available || 0);
      const gap = lastValid ? rlDateDiff(lastValid, todayDate) : null;
      const missedDays = gap === null ? 0 : Math.max(0, gap - 1);
      // validated : jour validé · pending : à valider aujourd'hui · frozen : gels suffisants · broken : série perdue
      const status = gap === null ? 'none' : gap <= 0 ? 'validated' : missedDays === 0 ? 'pending' : missedDays <= freezes ? 'frozen' : 'broken';
      const current = status === 'broken' ? 0 : (st?.current_streak || 0);
      const playedToday = act && rlParisDate(Number(act.last_signal_at)) === todayDate;
      const secondsToday = playedToday ? Number(st?.playtime_seconds_today || 0) : 0;
      const rewardDay = status === 'validated' ? current : current + 1;
      const dailyReward = rewardDay >= 100 ? 20 : rewardDay >= 60 ? 15 : rewardDay >= 30 ? 12 : rewardDay >= 14 ? 10 : rewardDay >= 7 ? 8 : 5;
      const nextMilestone = RL_STREAK.milestones.find(([day]) => day > current) || null;
      streak = { current, longest: st?.longest_streak || 0, lastValidDate: lastValid, status, validatedToday: status === 'validated', missedDays,
        todaySeconds: secondsToday, requiredSeconds: RL_STREAK.minSeconds, progress: Math.min(1, secondsToday / RL_STREAK.minSeconds),
        freezes, freezeMax: RL_STREAK.freezeCap, freezeEvery: 7, share: share?.value === 'true', dailyReward,
        nextMilestone: nextMilestone ? { day: nextMilestone[0], bonus: nextMilestone[1] } : null,
        milestones: RL_STREAK.milestones.map(([day, bonus]) => ({ day, bonus })) };
```

Puis *Déployer*.

## Vérifier

Joue 15 minutes : la page Profil (ou Quêtes) de ReLaunch montre la barre « x min / 15 min » qui monte, puis
« Aujourd'hui : validé », et la série passe à 1 (Éclats versés).
