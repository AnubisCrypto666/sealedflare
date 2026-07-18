# Plan pracy: Sealed-Bid OTC dla FXRP
## Flare Summer Signal — tor 2 (Confidential Compute Apps)

**Nazwa robocza projektu:** SealedFlare (do zmiany, jeśli wpadnie Ci coś lepszego)
**Deadline zgłoszenia:** 14 sierpnia 2026 (celujemy w 12-13 sierpnia, żeby mieć bufor)
**Dziś:** 17 lipca — mamy pełne 4 tygodnie.

---

## 1. Co budujemy (spec dla Claude Code)

Platforma prywatnych aukcji z zapieczętowanymi ofertami na bloki FXRP.

**Problem:** duże zlecenia sprzedaży FXRP na przejrzystym łańcuchu są widoczne przed wykonaniem — rynek reaguje, cena ucieka, instytucje nie chcą handlować. To dokładnie ten problem, który Flare wskazuje jako powód istnienia Confidential Compute.

**Rozwiązanie — przebieg aukcji:**
1. Sprzedający wystawia aukcję: deponuje FXRP w kontrakcie escrow na Flare, ustala czas trwania i cenę minimalną (opcjonalnie ukrytą).
2. Kupujący składają oferty zaszyfrowane kluczem publicznym modułu TEE. On-chain ląduje tylko commitment (hash) + zaszyfrowany blob. Nikt nie widzi cudzych cen.
3. Po zamknięciu okna moduł FCE (Flare Compute Extension — kontener Docker działający w TEE) odszyfrowuje oferty, wyłania zwycięzcę i podpisuje wynik swoim kluczem tożsamości TEE.
4. Kontrakt weryfikuje podpis, przekazuje FXRP zwycięzcy, środki sprzedającemu, zwalnia depozyty przegranych. Publiczna jest tylko cena zwycięska — przegrane oferty nigdy nie wychodzą na jaw.

**Komponenty:**

| Komponent | Technologia | Kto robi |
|---|---|---|
| `SealedBidAuction.sol` + `AuctionFactory.sol` | Solidity, Foundry/Hardhat | Claude Code |
| Moduł FCE (logika aukcji w TEE) | Docker + Python/Node, tryb `SIMULATION` / `FCC` | Claude Code |
| Frontend (tworzenie aukcji, składanie ofert, lista, wyniki) | React/Next.js + wagmi + MetaMask | Kimi K3 (koordynuje Claude Code) |
| Integracja FTSO | odczyt feedu XRP/USD na Coston2 (cena referencyjna w UI) | Claude Code |
| Szyfrowanie ofert w przeglądarce | ECIES/libsodium do klucza publicznego TEE | Claude Code |

**Kluczowa decyzja architektoniczna:** moduł FCE ma dwa tryby uruchomienia za tym samym interfejsem — `SIMULATION` (działa lokalnie, klucz testowy jawnie opisany w repo) i `FCC` (prawdziwe TEE na Songbird, jeśli dostęp otworzy się przed deadlinem). Kontrakty nie widzą różnicy: weryfikują podpis zarejestrowanego klucza. Dzięki temu 80% projektu nie zależy od harmonogramu Flare.

**Sieci:** kontrakty i demo na **Coston2** (chain ID 114, faucet daje C2FLR i testowe FXRP). Moduł FCE na Songbird tylko jeśli FCC otworzy się publicznie.

---

## 2. Podział ról

**Ty:** konta i rejestracje, portfel i testowanie z perspektywy użytkownika, pytania na Discordzie Flare, nagranie demo, wysłanie zgłoszenia. Zero pisania kodu.

**Claude Code (subskrypcja Claude):** architektura, kontrakty, moduł FCE, integracje, testy, deploy na Coston2, koordynacja Kimi, teksty zgłoszenia.

**Kimi K3 (plan Moderato, przez CLI Kimi Code wywoływane z Claude Code):** cały frontend — layout, komponenty, responsywność, animacje.

**Żelazna zasada bezpieczeństwa:** załóż świeży portfel wyłącznie do tego projektu, trzymaj na nim tylko środki testowe z faucetu. Nigdy nie wklejaj seed phrase ani klucza prywatnego do żadnego czatu z AI. Klucz deployera trafia do pliku `.env`, który jest w `.gitignore` — Claude Code to pilnuje, ale sprawdź przed pierwszym pushem na GitHub.

---

## 3. Harmonogram

### Tydzień 0 — start (17-20 lipca, weekend)

Twoje zadania ręczne, w kolejności:

1. Zarejestruj się na DoraHacks i zapisz projekt do hackathonu (tor: Confidential Compute Apps): dorahacks.io/hackathon/flaresummersignal
2. Dołącz do Discorda Flare (link na dev.flare.network) i zadaj na kanale dev pytanie — wklej po angielsku:
   > "Hi! I'm building for Summer Signal in the Confidential Compute track. Will external developers be able to register their own Flare Compute Extensions (FCE) on Songbird before Aug 14, or should we build against the FCE spec with a simulated TEE for the demo? Any timeline for the FCC developer guides?"
   Odpowiedź na to pytanie to nasza **Bramka 1** (patrz sekcja 5).
3. Zainstaluj Node.js LTS (nodejs.org), potem w terminalu: `npm install -g @anthropic-ai/claude-code`, następnie `claude` i zaloguj się kontem z subskrypcją Claude.
4. Kimi: konto na kimi.com → plan Moderato (19 USD/mies.) → kimi.com/code/console → Create API Key (nazwij "hackathon") → **skopiuj klucz od razu do menedżera haseł** (nie zobaczysz go ponownie). Nie wklejaj klucza do czatów.
5. Zainstaluj MetaMask, utwórz **nowy, dedykowany profil/portfel** do projektu. Dodaj sieć Coston2 (RPC: `https://coston2-api.flare.network/ext/C/rpc`, chain ID `114`, symbol `C2FLR`, explorer: `https://coston2-explorer.flare.network`). Pobierz C2FLR i FXRP z faucetu: faucet.flare.network/coston2
6. Załóż konto na GitHub (jeśli nie masz) i puste repozytorium, np. `sealedflare`.

### Tydzień 1 (21-27 lipca) — fundamenty

Otwórz terminal w pustym folderze projektu, uruchom `claude` i wklej **Prompt A** (sekcja 4). Claude Code:
- skonfiguruje projekt, pobierze oficjalne Flare AI Skills i podłączy MCP serwer Flare (dev.flare.network → sekcja AI tools),
- ustawi integrację z Kimi Code CLI jako subagentem frontendowym,
- napisze i przetestuje kontrakty `AuctionFactory` + `SealedBidAuction`,
- zdeployuje je na Coston2 i poda Ci adresy (zapisz je — będą w zgłoszeniu).

Twój udział: podanie klucza API Kimi bezpośrednio w terminalu, gdy CLI o niego poprosi (nie w czacie), zatwierdzanie transakcji deployu w MetaMask, przetestowanie ręcznie: czy widzisz w explorerze Coston2 utworzoną aukcję testową.

**Cel na koniec tygodnia:** kontrakty działają na Coston2, w explorerze widać testową aukcję.

### Tydzień 2 (28 lipca - 3 sierpnia) — moduł TEE i szyfrowanie

Wklej **Prompt B**. Claude Code:
- zbuduje moduł FCE jako kontener Docker zgodny ze specyfikacją FCC (reprodukowalny obraz, tożsamość kluczowa, interfejs instrukcje→wynik),
- zaimplementuje tryb `SIMULATION` z pełnym przebiegiem: odbiór zaszyfrowanych ofert → deszyfrowanie → wybór zwycięzcy → podpisany wynik → rozliczenie w kontrakcie,
- zrobi szyfrowanie ofert po stronie przeglądarki,
- zleci Kimi K3 pierwszą wersję frontendu (tworzenie aukcji + składanie ofert).

Twój udział: przejście pełnego flow jako sprzedający i jako kupujący (dwa konta w MetaMask), zgłaszanie co jest niejasne w UI — to cenny feedback, bo sędziowie też będą klikać na świeżo.

**Cel:** pełna aukcja end-to-end działa w trybie symulacji.

### Tydzień 3 (4-10 sierpnia) — integracja i decyzja FCC

Wklej **Prompt C**. Claude Code:
- dołoży odczyt ceny XRP/USD z FTSO do UI,
- dopracuje z Kimi frontend (lista aukcji, odliczanie, historia, obsługa błędów),
- napisze testy i przejdzie scenariusze brzegowe (brak ofert, remis, wygaśnięcie),
- zainwestuje odzyskany czas (FCC odpadło — patrz Bramka 1) w dokumentację architektury: diagram przepływu, sekcję README "path to production FCC" pokazującą, że przejście na prawdziwe TEE to wymiana jednego modułu, oraz w dopieszczenie UX z Kimi.

**Cel:** produkt gotowy do pokazania, dokumentacja "symulacja dziś → FCC jutro" napisana.

### Tydzień 4 (11-14 sierpnia) — demo i zgłoszenie

Wklej **Prompt D**. Claude Code przygotuje: README, opis architektury z diagramem, teksty do formularza DoraHacks, skrypt demo.

Twoje zadania:
1. Nagraj 2-3 min wideo (nagrywanie ekranu + Twój głos, po angielsku lub z angielskimi napisami): problem → pokaz pełnej aukcji → co jest w TEE i dlaczego → roadmapa. Prosty, szczery ton wygrywa z wyprodukowanym marketingiem.
2. Wypełnij zgłoszenie na DoraHacks (checklist w sekcji 6).
3. Wyślij **najpóźniej 13 sierpnia** — dzień bufora na problemy z platformą.

---

## 4. Prompty do wklejenia w Claude Code

### Prompt A — start projektu (tydzień 1)

```
Budujemy projekt na hackathon Flare Summer Signal (tor: Confidential Compute
Apps, deadline 14 sierpnia): platformę sealed-bid aukcji na FXRP o nazwie
SealedFlare. Pełna specyfikacja jest w pliku plan-pracy-flare-summer-signal.md
w tym folderze - przeczytaj ją najpierw.

Zadania na dziś:
1. Pobierz oficjalne Flare AI Skills (github.com/flare-foundation/flare-ai-skills)
   i skonfiguruj je w tym projekcie. Podłącz też MCP serwer Flare Developer Hub
   wg instrukcji na dev.flare.network/network/guides/flare-developer-hub-mcp-server.
   Dokumentacja Flare ma wersje markdown - dopisuj .md do URL-i stron.
2. Zainstaluj oficjalne CLI Kimi Code i skonfiguruj je tak, żebym mógł podać
   klucz API bezpośrednio w terminalu (nie podawaj mi go do wpisania w czacie).
   Utwórz skill/instrukcję: wszystkie zadania frontendowe (UI, layout, style,
   komponenty React) delegujesz do Kimi K3 przez CLI, po czym weryfikujesz
   i integrujesz wynik.
3. Zainicjuj repo (git), scaffold projektu: kontrakty (Foundry), moduł FCE
   (folder fce/, Docker), frontend (Next.js + wagmi). .env w .gitignore od razu.
4. Napisz kontrakty AuctionFactory i SealedBidAuction wg specyfikacji:
   escrow FXRP, faza commitmentów ofert (hash + zaszyfrowany blob w evencie),
   rozliczenie po podpisanym wyniku z zarejestrowanego klucza modułu TEE,
   zwroty depozytów, obsługa braku ofert i wygaśnięcia. Testy w Foundry.
5. Zdeployuj na Coston2 (chain 114). Poprowadź mnie krok po kroku przy
   konfiguracji klucza deployera w .env - mam świeży testowy portfel.
   Na końcu podaj adresy kontraktów i link do explorera.

Zasady: nigdy nie proś mnie o wklejenie klucza prywatnego ani seed phrase do
czatu. Jedna czynność ręczna na raz, czekaj aż potwierdzę wykonanie.
```

### Prompt B — moduł TEE i pełny przepływ (tydzień 2)

```
Kontrakty działają na Coston2. Teraz moduł FCE i pełny przepływ aukcji:

1. Zbuduj moduł FCE w folderze fce/ jako reprodukowalny obraz Docker zgodny
   ze specyfikacją Flare Compute Extensions (dev.flare.network/fcc/overview.md
   i podstrony fcc/guides): tożsamość = klucz generowany przy starcie,
   wejście = instrukcje/zaszyfrowane oferty, wyjście = podpisany wynik aukcji.
2. Dwa tryby za tym samym interfejsem: SIMULATION (uruchamiany lokalnie,
   klucz testowy, jasno opisany w README jako symulacja TEE na czas, gdy FCC
   nie jest jeszcze publicznie dostępne) oraz FCC (przygotowany pod rejestrację
   na Songbird, gdy przewodniki się pojawią).
3. Szyfrowanie ofert w przeglądarce do klucza publicznego modułu (ECIES lub
   libsodium sealed box). On-chain: commitment + zaszyfrowany blob w evencie.
4. Spięcie: skrypt/serwis, który po zamknięciu aukcji przekazuje oferty do
   modułu, odbiera podpisany wynik i wywołuje settle() na kontrakcie.
5. Zleć Kimi K3 pierwszą wersję frontendu: strona tworzenia aukcji, strona
   składania oferty (z szyfrowaniem), lista aukcji z odliczaniem, podłączenie
   MetaMask przez wagmi. Zweryfikuj kod Kimi i zintegruj.
6. Przetestujmy pełny przepływ: poprowadź mnie jako sprzedającego i kupującego
   (dwa konta MetaMask na Coston2).
```

### Prompt C — integracja i szlif (tydzień 3)

```
Pełny przepływ działa. Teraz:
1. Dodaj odczyt ceny XRP/USD z FTSO na Coston2 i pokaż ją w UI jako cenę
   referencyjną przy tworzeniu aukcji i składaniu ofert.
2. Zostajemy przy trybie SIMULATION - zespół Flare potwierdził na Discordzie,
   że na czas hackathonu to zalecane podejście na Coston2. Napisz w README
   sekcję "Path to production FCC": dokładnie co i jak się zmieni przy
   przejściu na prawdziwe TEE (ma być widać, że to wymiana jednego modułu,
   bez zmian w kontraktach). Dodaj diagram architektury (mermaid).
3. Zleć Kimi dopracowanie frontendu: stany błędów, historia aukcji, widok
   wyniku (tylko zwycięska cena, podkreślenie że przegrane oferty pozostają
   prywatne), responsywność.
4. Testy scenariuszy brzegowych: zero ofert, jedna oferta, remis, oferta
   poniżej ceny minimalnej, wygaśnięcie bez rozliczenia.
5. Wypisz mi listę rzeczy do ręcznego przetestowania.
```

### Prompt D — materiały zgłoszeniowe (tydzień 4)

```
Przygotuj materiały zgłoszeniowe na DoraHacks (po angielsku):
1. README repo: problem, architektura z diagramem (mermaid), co działa dziś,
   co czeka na publiczne FCC, instrukcja uruchomienia dla sędziów krok po
   kroku, adresy kontraktów na Coston2.
2. Teksty do formularza: krótki opis produktu, target user (OTC deski,
   posiadacze dużych pozycji XRP, instytucje), wyjaśnienie użycia Flare
   (FCC/FCE + FTSO + escrow na Coston2), co zostało zbudowane w trakcie
   hackathonu (wszystko - projekt od zera), roadmapa 3 kroków.
3. Skrypt 2-3 min demo wideo: problem (30s), pokaz aukcji end-to-end (90s),
   architektura TEE i roadmapa (30s).
4. Sprawdź, czy repo jest czyste: brak sekretów, .env.example zamiast .env,
   licencja MIT.
```

---

## 5. Bramki ryzyka

**Bramka 1 — ROZSTRZYGNIĘTA (17 lipca):** zespół Flare odpowiedział: "Right now use simulated approach against Coston2 network." Budujemy wyłącznie tryb SIMULATION na Coston2. W zgłoszeniu i README piszemy wprost, że to podejście zalecone przez zespół Flare na czas hackathonu — to atut, nie słabość. Rejestrację na prawdziwym FCC opisujemy jako pierwszy krok roadmapy.

**Bramka 2 (ok. 6 sierpnia):** jeśli pełny przepływ w symulacji nie działa stabilnie — decyzja o awaryjnym uproszczeniu: rezygnujemy z trybu FCC całkowicie, symulację opisujemy jako proof-of-concept architektury i dowozimy maksymalnie dopracowane demo. Nie przepisujemy projektu na wariant 3 (Pay-Gate), chyba że coś fundamentalnie się zawali do 4 sierpnia — wtedy Pay-Gate współdzieli portfel, frontend i infrastrukturę FDC, więc pivot jest wykonalny w ~10 dni.

**Stała zasada:** commitujemy i pushujemy na GitHub codziennie. Historia commitów to dla sędziów dowód "evidence of new work".

---

## 6. Checklist zgłoszenia (DoraHacks, do 13 sierpnia)

- [ ] Nazwa projektu
- [ ] Tor: Confidential Compute Apps (bounty 2)
- [ ] Krótki opis produktu (z Promptu D)
- [ ] Target user
- [ ] Link do działającego demo (frontend zdeployowany np. na Vercel) + wideo
- [ ] Link do repo GitHub (publiczne, czyste z sekretów)
- [ ] Wyjaśnienie użycia Flare: FCC/FCE, FTSO, escrow FXRP na Coston2
- [ ] Co powstało w trakcie hackathonu: całość od zera (projekt nie istniał przed 29 czerwca)
- [ ] Adresy kontraktów na Coston2 + linki do explorera
- [ ] Roadmapa: (1) deploy FCE na produkcyjne FCC po publicznym otwarciu, (2) mainnet + prawdziwy FXRP, (3) aukcje dla kolejnych FAssets (FBTC po starcie)
- [ ] Sekcja "traction": opisz szczerze — projekt hackathonowy, ale wskaż komu go pokażesz (np. społeczność XRP na Discordzie Flare)

---

## 7. Koszty całości

- Subskrypcja Claude: już masz.
- Kimi Moderato: 19 USD (jeden miesiąc wystarczy).
- Gaz na Coston2: darmowy (faucet).
- Hosting frontendu: darmowy (Vercel free tier).
- Domena (opcjonalnie, ładniej wygląda w zgłoszeniu): ~10-15 USD.

Razem: ~19-35 USD poza tym, co już płacisz.
