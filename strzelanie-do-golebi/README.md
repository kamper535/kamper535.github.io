# Strzelanie do gołębi

Prosta gra przeglądarkowa: strzelaj do gołębi, klikając je myszką. Zbudowana w HTML5 Canvas i czystym JS. W zestawie prosty serwer Node bez zależności do uruchomienia lokalnie.

## Uruchomienie lokalne

Wymagania: Node.js 16+.

1. Otwórz PowerShell w tym folderze:
   ```powershell
   cd C:\projekty\eksperyment1
   ```
2. Uruchom serwer:
   ```powershell
   npm start
   ```
3. Otwórz przeglądarkę na adresie:
   - `http://localhost:3000`

## Sterowanie
- Lewy przycisk myszy: strzał
- Ruch myszy: celowanie
- Start / Resetuj: przyciski w górnym pasku (HUD)

## Zasady
- Gra trwa 60 sekund. Końcowe punkty zostaną pokazane po upływie czasu.
- Gołębie pojawiają się co pewien czas i z czasem delikatnie przyspieszają.
- Pudło nalicza się przy kliknięciu w puste niebo.
- Punktacja: małe gołębie = 5 pkt, duże = 1 pkt.
- Trafienie gołębia z bombą kasuje cały wynik (0 pkt).
- Specjalny nabój po 5 trafieniach powoduje wybuch i zabija okoliczne gołębie.

## Prawdziwy dźwięk strzału
- Umieść plik `shot.mp3` (krótki dźwięk strzału) w katalogu głównym projektu.
- Gra automatycznie go odtworzy przy trafieniu. Jeśli pliku nie ma lub przeglądarka zablokuje autoplay, użyty będzie dźwięk syntetyczny jako fallback.

## Muzyka w tle
- Dodaj plik `pirates.mp3` (cicha muzyka w klimacie „Piraci z Karaibów”) do katalogu głównego.
- Muzyka odtwarza się podczas gry, a po zakończeniu/rezecie jest zatrzymywana.

## Przeładowanie rewolweru
- Po 7 strzałach rewolwer przeładowuje się 3 sekundy i nie można strzelać.
- Aby mieć oryginalny dźwięk przeładowania, dodaj `reload.mp3` do katalogu głównego. Jeśli pliku nie będzie, gra zadziała, ale bez dźwięku przeładowania.



