# Käseabend – so bringst du die App online

Du brauchst kein Terminal. Alles läuft im Browser am Mac.

## Schritt 1 – Datenbank bei Supabase anlegen (ca. 5 Min.)

1. Gehe auf https://supabase.com und klicke auf **Start your project**. Melde dich mit **GitHub** an (Konto Yannick-cyber1).
2. Klicke auf **New project**.
   - Name: `kaeseabend`
   - Database Password: auf **Generate a password** klicken (brauchst du nie wieder).
   - Region: **Central EU (Frankfurt)**
   - Auf **Create new project** klicken und ca. 1–2 Minuten warten.
3. Links in der Leiste auf **SQL Editor** klicken.
4. Die Datei `setup.sql` aus dem Ordner öffnen (Doppelklick → TextEdit), alles markieren (**⌘A**), kopieren (**⌘C**).
5. Im SQL Editor in das große Textfeld klicken, einfügen (**⌘V**) und unten rechts auf **Run** klicken.
   - Falls eine Warnung „destructive operation“ erscheint: **Run this query** klicken. (Sie bezieht sich nur auf das Ersetzen der Zugriffsregeln.)
   - Unten muss **Success. No rows returned** stehen.

## Schritt 2 – Die zwei Werte in die App eintragen

1. In Supabase oben auf **Connect** klicken.
2. Dort stehen die **Project URL** (beginnt mit `https://` und endet mit `.supabase.co`) und der **Publishable key** (beginnt mit `sb_publishable_`).
   - Falls du keinen Publishable key siehst: links **Project Settings → API Keys**. Der **anon**-Key geht genauso.
3. Öffne im App-Ordner die Datei `js/config.js` mit TextEdit
   (Rechtsklick → Öffnen mit → TextEdit).
4. Ersetze nur den Text zwischen den Anführungszeichen:
   - `HIER_PROJECT_URL_EINFUEGEN` → deine Project URL
   - `HIER_PUBLISHABLE_KEY_EINFUEGEN` → dein Publishable key
   Am besten den Platzhalter per Doppelklick markieren und den kopierten Wert einfügen. Selbst keine Anführungszeichen tippen, TextEdit macht daraus sonst „schöne“ Zeichen, und dann startet die App nicht. Speichern mit **⌘S**.

Beide Werte dürfen öffentlich sein. Den **Secret key** dagegen nie verwenden.

## Schritt 3 – Auf GitHub hochladen

1. Gehe auf https://github.com/new
   - Repository name: `kaeseabend`
   - **Public** auswählen
   - Auf **Create repository** klicken.
2. Auf der nächsten Seite auf den Link **uploading an existing file** klicken.
3. Öffne im Finder den Ordner `kaeseabend`, markiere **alles darin** (⌘A) und ziehe es ins Browserfenster.
   Wichtig: den **Inhalt** ziehen, nicht den Ordner selbst. `index.html` muss ganz oben liegen.
4. Unten auf **Commit changes** klicken.
5. Oben auf **Settings** → links **Pages**.
   Bei *Branch* **main** und **/(root)** wählen → **Save**.
6. Nach 1–2 Minuten ist die App erreichbar unter:
   **https://yannick-cyber1.github.io/kaeseabend/**

## Schritt 4 – Aufs iPhone holen (alle)

1. Den Link in **Safari** öffnen (nicht Chrome).
2. Unten auf das **Teilen-Symbol** (Quadrat mit Pfeil) tippen.
3. **Zum Home-Bildschirm** wählen → **Hinzufügen**.
4. App über das Käse-Icon öffnen und den eigenen Namen antippen.

## Später etwas ändern

Geänderte Datei auf GitHub im Repository wieder per **Add file → Upload files** hochladen und **Commit changes** klicken. Nach 1–2 Minuten haben alle die neue Version.

## Gut zu wissen

- **Pause bei Supabase:** Gratis-Projekte pausieren nach etwa einer Woche ohne Nutzung. Dann zeigt die App einen Verbindungsfehler. Lösung: bei supabase.com einloggen, Projekt öffnen und auf **Restore project** klicken.
- **Wer den Link hat, kann eintragen.** Für eine Freundesgruppe passt das. Teile den Link einfach nicht öffentlich.
- Ein Käse kann in seiner Detailansicht ganz unten gelöscht werden. Dabei verschwinden auch seine Bewertungen.
