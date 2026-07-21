# Status projektu SealedFlare — 21 lipca 2026

## Zamknięty tydzień 1 (Prompt A):
- Flare AI Skills + MCP serwer podłączone
- Kimi Code CLI zainstalowane i zalogowane (device flow, macOS)
- Repo: github.com/AnubisCrypto666/sealedflare
- Kontrakty AuctionFactory + SealedBidAuction napisane, 19/19 testów Foundry
- Deploy AuctionFactory na Coston2: 0x58158479582bc0BA6bEa5822eaAE01a8Bd6E47A1
- Kod źródłowy zweryfikowany w Coston2 explorerze
- initialTeeSigner = address(0) — do ustawienia w Prompcie B

## Zamknięty tydzień 2 (Prompt B):
- Moduł FCE (`fce/`, Docker, tryb SIMULATION): generowanie tożsamości TEE (klucz podpisujący + klucz szyfrujący), deszyfrowanie ofert (libsodium sealed box), wybór zwycięzcy, podpis zgodny z kontraktem. Tożsamość przetrwa restart kontenera (wolumen).
- TEE signer zarejestrowany na Coston2: `0x91130d93B248182430661678df77A371f7627A92`
- Skrypt rozliczający `fce/src/settle-auction.ts`: czyta zdarzenia z chaina, pyta FCE, wywołuje `settle()`/`settleNoWinner()`
- Szyfrowanie ofert w przeglądarce (`frontend/lib/bidEncryption.ts`)
- Frontend (Kimi K3, zweryfikowany i zintegrowany przeze mnie): connect wallet, lista aukcji z odliczaniem, tworzenie aukcji (publiczna/ukryta/brak rezerwy), szczegóły aukcji + składanie oferty + odbiór wygranej/zwrotów
- **Pełny test end-to-end na żywym Coston2, obie ścieżki:**
  - Aukcja `0x96c992aa0fe4c18790c93fce357b6948e3288ca0` — zamknięta jako Expired (NO_WINNER, oferta poniżej ukrytej rezerwy + minęło okno rozliczenia), reclaim + refund wykonane
  - Aukcja `0xa2e4630B21C5E2829267D2dc328F523624C7DA0c` — Settled, cena wygrywająca 2 C2FLR, wszystkie claims (lot, proceeds, refund nadwyżki) wykonane
- 4 realne bugi znalezione podczas testów manualnych i naprawione:
  1. Connector portfela preferował MetaMask SDK zamiast generycznego "injected" — Rabby nie łączył się
  2. Brak nagłówków CORS w module FCE — przeglądarka blokowała `fetch` ("Failed to fetch")
  3. `bids(address)` dekodowane jako krotka pozycyjna, nie obiekt — cast `as Bid` dawał same `undefined`, crash na stronie szczegółów
  4. Publiczny RPC Coston2 ogranicza `eth_getLogs` do 30 bloków na zapytanie — skrypt rozliczający wymagał paginacji
- Feedback z testów wdrożony: ostrzeżenie w formularzu oferty o ukrytej rezerwie (przegrana = tylko zwrot depozytu), ostrzeżenie przy tworzeniu aukcji gdy rezerwa = depozyt, live countdown + auto-odświeżanie (15s) statusu rozliczenia na stronie szczegółów
- **Incydent bezpieczeństwa (naprawiony):** token GitHub był zapisany jawnym tekstem w `.git/config` (ustawiony w innej sesji). Token unieważniony przez użytkownika, URL zdalnego repo wyczyszczony, `gh auth login` wykonany, `git push` działa poprawnie
- Wszystko wypchnięte na GitHub (`github.com/AnubisCrypto666/sealedflare`, gałąź main)

## Zamknięty tydzień 3 (Prompt C):
- Integracja FTSO XRP/USD (`frontend/lib/useXrpUsdPrice.ts`): żywa cena referencyjna na stronie tworzenia aukcji i stronie szczegółów aukcji (widoczna niezależnie od stanu aukcji, nie tylko przy aktywnym składaniu oferty), auto-odświeżanie co 5s. Zweryfikowana bezpośrednio na Coston2 przez `cast` przed wpięciem do UI.
- Filtr historii aukcji na liście: zakładki Open / Settled / Ended / All z licznikami, filtrowanie po stronie klienta.
- README repo: sekcja "Path to production FCC" (co i jak się zmienia przy przejściu na prawdziwe TEE — bez zmian w kontraktach) + diagram architektury (mermaid).
- Dopracowanie UX z Kimi K3: filtr historii, audyt stanów błędów (retry przy nieudanym odczycie RPC na liście/szczegółach, jawna informacja o nieudanym odczycie salda FXRP), poprawki responsywności (~375px: header, segmented controls, przyciski claim, długie adresy/kwoty).
- Brand design — wariant D "Ember + pulse" wdrożony na cały frontend na podstawie oficjalnego brand kitu Flare Network (Flare Pink #E62058): gradientowy wordmark "SealedFlare" w headerze, statyczna różowa kreska u góry kart aukcji (zawsze widoczna, nie tylko na hover — dobrane tak, żeby czytelnie wyszło na statycznym screenie/wideo z hackathonu), glow pod kartą na hover, pulsująca różowa kropka + różowy countdown na aktywnych (Open) aukcjach. Countdown okna rozliczenia zostaje bursztynowy (inne znaczenie: ostrzeżenie, nie status "live"). Proces wyboru: 3 warianty do przejrzenia (Signal / Ember / Live wire) na osobnej, izolowanej stronie podglądu → hybryda B+C na życzenie użytkownika → wzmocnienie kreski (1px→3px) po tym, jak pierwsza wersja okazała się za subtelna → wdrożenie na realne strony → usunięcie strony podglądu.
- 13/13 testów edge-case dla logiki FCE (`fce/src/auction.test.ts`): brak ofert, jedna oferta, remis (rozstrzygany po najwcześniejszym committcie), oferta powyżej depozytu, oferta poniżej rezerwy (jawnej i ukrytej), uszkodzony szyfrogram, sfałszowany hash commitmentu.
- Manualne QA (checklist z Prompt C) przeszło w całości; przy okazji znaleziono i naprawiono realny bug (`bids(address)` dekodowane jako krotka pozycyjna, nie obiekt — patrz tydzień 2).
- Dodatkowy pełny test end-to-end na nowej aukcji: `0xa44073CC7EE2a37dA972f9299909567b3b12F0f8` — licytacja zamknięta, rozliczona przez moduł FCE (`settle-auction.ts`), stan **Settled**, zwycięzca `0x1cc5...5203`, cena wygrywająca 1 C2FLR, potwierdzone w UI (wariant D widoczny na karcie).

**Aktualny stan kontraktów (Coston2, chain 114):**
- `AuctionFactory`: `0x58158479582bc0BA6bEa5822eaAE01a8Bd6E47A1`
- TEE signer zarejestrowany i aktywny: `0x91130d93B248182430661678df77A371f7627A92` (`isTrustedSigner` = true)
- Repo: https://github.com/AnubisCrypto666/sealedflare (gałąź main, w pełni zsynchronizowane)

## Rozstrzygnięcia:
- Odpowiedź zespołu Flare na Discordzie: "Right now use simulated approach against Coston2 network." — budujemy wyłącznie tryb SIMULATION, brak deploymentu na prawdziwe FCC.

## Środowisko:
- Mac (macOS)
- Portfel testowy w Rabby, adres deployera 0x8f27...D0954, saldo 100 C2FLR
- Drugi portfel (kupujący) używany w testach tygodnia 2
- Rozmawiam po polsku
- Preferuję: jedna czynność ręczna na raz, dokładne kroki

## Następny krok:
Tydzień 3 zamknięty — gotowy na Prompt D (materiały zgłoszeniowe).
