# Language Pack Review V1

Representative copy from all five locale packs, prepared for owner review
without requiring inspection of the 2,460-entry catalog.

The reviewed English, Turkish, German, Spanish and French packs are active in
production. All five locales appear in the language selector, the four
localized route trees are indexable, and every indexable route publishes the
reciprocal five-language `hreflang` graph plus English `x-default`.

## Production status

| Locale | Coverage | Projects | Generated documents | Registry active | Production-indexable |
| --- | ---: | ---: | ---: | --- | --- |
| `en` English | 100% source | 25/25 | 42 canonical routes | yes | yes |
| `tr` Türkçe | 100% | 25/25 | 44 (42 canonical + 2 companion) | yes | yes |
| `de` Deutsch | 100% | 25/25 | 44 (42 canonical + 2 companion) | yes | yes |
| `es` Español | 100% | 25/25 | 44 (42 canonical + 2 companion) | yes | yes |
| `fr` Français | 100% | 25/25 | 44 (42 canonical + 2 companion) | yes | yes |

| Domain | Entries | TR | DE | ES | FR |
| --- | ---: | ---: | ---: | ---: | ---: |
| `ui` | 9 | 9/9 | 9/9 | 9/9 | 9/9 |
| `meta` | 76 | 76/76 | 76/76 | 76/76 | 76/76 |
| `content` | 117 | 117/117 | 117/117 | 117/117 | 117/117 |
| `projects` | 415 | 415/415 | 415/415 | 415/415 | 415/415 |
| `dynamic` | 432 | 432/432 | 432/432 | 432/432 | 432/432 |
| `case-studies` | 542 | 542/542 | 542/542 | 542/542 | 542/542 |
| `pages` | 869 | 869/869 | 869/869 | 869/869 | 869/869 |

`npm run i18n:coverage` is the source of truth for these figures. Generation
and `qa:i18n` reject missing entries; English fallback does not count as
coverage.

## Register and terminology policy

- **German:** formal **Sie** on every visitor-facing surface, including games.
- **Spanish:** neutral international professional Spanish; formal/neutral
  **usted** where direct address is genuinely needed. No `tú`/`usted` mixing.
- **French:** modern professional **vous**. No visitor-facing `tu` and no
  bureaucratic phrasing.
- Canonical role, product and project names stay unchanged, including
  **Forward Deployed Engineer**, **AI Engineer**, **Solution Engineer**,
  **SINAMA**, **Merge Rush: Tiny Factory**, **Hospital Form App** and **Ajoop**.
- Established technical terms remain English where that is the natural
  professional usage: **Applied AI**, **AI**, **LLM**, **RAG**, **workflow**,
  **chatbot**, **frontend**, **deployment**, **GitHub**, **JavaScript**,
  **TypeScript**, **Python**, **React**, **FastAPI**, **Next.js**, **n8n**,
  **Umami** and **Google Cloud**.
- Protocol tokens, technology lists and diagrams listed in
  `data/i18n/glossary.json` are deliberately language-neutral. QA allows
  byte-identical copy only for these reviewed exceptions.

## Home hero and supporting copy

| Locale | Hero direction |
| --- | --- |
| EN | Forward Deployed Engineer with evidence across Applied AI, AI reliability, solution engineering and product-minded software delivery. |
| TR | Applied AI, AI reliability, solution engineering ve ürün odaklı yazılım geliştirme alanlarında kanıt sunan Forward Deployed Engineer. |
| DE | Forward Deployed Engineer mit Belegen aus Applied AI, AI-Zuverlässigkeit, Solution Engineering und produktorientierter Softwareauslieferung. |
| ES | Forward Deployed Engineer con evidencia en Applied AI, fiabilidad de AI, solution engineering y entrega de software orientada a producto. |
| FR | Forward Deployed Engineer avec des preuves en Applied AI, fiabilité de l'AI, solution engineering et livraison logicielle orientée produit. |

| EN | TR | DE | ES | FR |
| --- | --- | --- | --- | --- |
| Open for work | İşe açık | Offen für Angebote | Disponible para nuevas oportunidades | Ouvert aux opportunités |

## Works

| Locale | Page description |
| --- | --- |
| EN | Selected Applied AI, software, web and game-product work by Kaan Balcı, led by SINAMA and Merge Rush: Tiny Factory. |
| TR | Kaan Balcı'nın SINAMA ve Merge Rush: Tiny Factory önderliğindeki seçilmiş Applied AI, yazılım, web ve oyun ürünü çalışmaları. |
| DE | Ausgewählte Arbeiten von Kaan Balcı aus Applied AI, Software, Web und Game-Produkten, angeführt von SINAMA und Merge Rush: Tiny Factory. |
| ES | Trabajos seleccionados de Kaan Balcı en Applied AI, software, web y producto de juegos, encabezados por SINAMA y Merge Rush: Tiny Factory. |
| FR | Travaux sélectionnés de Kaan Balcı en Applied AI, logiciel, web et produit de jeu, menés par SINAMA et Merge Rush: Tiny Factory. |

| EN | TR | DE | ES | FR |
| --- | --- | --- | --- | --- |
| Projects \| Kaan Balcı | Projeler \| Kaan Balcı | Projekte \| Kaan Balcı | Proyectos \| Kaan Balcı | Projets \| Kaan Balcı |

## About

| Locale | Page description |
| --- | --- |
| EN | Kaan Balcı's Forward Deployed Engineer direction and AI Designer & Software Developer background across reliable AI systems and product delivery. |
| TR | Kaan Balcı'nın Forward Deployed Engineer yönü ve güvenilir AI sistemleri ile ürün teslimatını kapsayan AI Designer & Software Developer geçmişi. |
| DE | Die Forward-Deployed-Engineer-Ausrichtung von Kaan Balcı und sein Hintergrund als AI Designer & Software Developer für zuverlässige AI-Systeme und produktreife Umsetzung. |
| ES | La orientación de Kaan Balcı como Forward Deployed Engineer y su trayectoria como AI Designer & Software Developer en sistemas de AI fiables y entrega de producto. |
| FR | L'orientation de Kaan Balcı comme Forward Deployed Engineer et son parcours d'AI Designer & Software Developer autour des systèmes d'AI fiables et de la livraison produit. |

## SINAMA

| Locale | Representative summary |
| --- | --- |
| EN | A Turkish-first reliability lab for repeatable multi-turn agent testing, deterministic workflow evidence, regression comparison, version trends and release-readiness decisions. |
| TR | Tekrarlanabilir multi-turn agent testleri, deterministik workflow kanıtı, regression karşılaştırması, version trendleri ve release-readiness kararları için Turkish-first reliability lab. |
| DE | Ein Turkish-first Reliability Lab für wiederholbare mehrstufige Agententests, deterministische Workflow-Belege, Regressionsvergleiche, Versionstrends und Release-Readiness-Entscheidungen. |
| ES | Un reliability lab Turkish-first para pruebas repetibles de agentes multi-turno, evidencia determinista de flujos, comparación de regresiones, tendencias por versión y decisiones de release-readiness. |
| FR | Un reliability lab Turkish-first pour des tests d'agents multi-tours reproductibles, des preuves déterministes de workflow, la comparaison des régressions, les tendances par version et les décisions de release-readiness. |

`READY`, `WARNING` and `BLOCKED` remain protocol values in all locales.

## Merge Rush: Tiny Factory

| Locale | Representative summary |
| --- | --- |
| EN | A Phaser 3 + TypeScript merge-game product connecting timed orders, factory restoration, progressive board unlocks, multi-cell pieces and platform-aware architecture for a YouTube Playables direction. |
| TR | Timed order'lar, fabrika onarımı, aşamalı board unlock, multi-cell parçalar ve YouTube Playables yönü için platform-aware mimariyi birleştiren Phaser 3 + TypeScript merge-game ürünü. |
| DE | Ein Merge-Game-Produkt mit Phaser 3 und TypeScript, das zeitgebundene Aufträge, Fabrik-Restaurierung, schrittweise freigeschaltete Spielfelder, mehrzellige Bauteile und plattformbewusste Architektur für eine YouTube-Playables-Ausrichtung verbindet. |
| ES | Un producto de juego de fusión con Phaser 3 y TypeScript que conecta pedidos con tiempo, restauración de la fábrica, desbloqueo progresivo del tablero, piezas de varias casillas y arquitectura consciente de la plataforma para una orientación a YouTube Playables. |
| FR | Un produit de jeu de fusion en Phaser 3 et TypeScript qui relie commandes chronométrées, restauration de l'usine, déblocage progressif du plateau, pièces multi-cases et architecture consciente de la plateforme, dans une orientation YouTube Playables. |

## Hospital Form App

| Locale | Project overview |
| --- | --- |
| EN | Hospital Form App is the portfolio card name for Hospital System, an individual Visual Programming course project that combines three role-specific Windows Forms journeys with direct SQL Server operations. The repository preserves code excerpts, schema and interface evidence rather than a runnable build. |
| TR | Hospital Form App, üç role özel Windows Forms yolculuğunu doğrudan SQL Server işlemleriyle birleştiren bireysel Görsel Programlama dersi projesi Hospital System'ın portfolio kart adıdır. Repository çalıştırılabilir build yerine kod dökümlerini, şemayı ve arayüz kanıtlarını korur. |
| DE | Hospital Form App ist der Portfolio-Name von Hospital System, einem Einzelprojekt aus dem Kurs Visuelle Programmierung, das drei rollenspezifische Windows-Forms-Abläufe mit direkten SQL-Server-Operationen verbindet. Das Repository bewahrt Codeauszüge, Schema und Oberflächenbelege statt eines lauffähigen Builds. |
| ES | Hospital Form App es el nombre en el portafolio de Hospital System, un proyecto individual de la asignatura de Programación Visual que combina tres recorridos de Windows Forms específicos por rol con operaciones directas sobre SQL Server. El repositorio conserva extractos de código, el esquema y evidencia de la interfaz, no una compilación ejecutable. |
| FR | Hospital Form App est le nom porté par Hospital System dans le portfolio : un projet individuel du cours de Programmation Visuelle qui associe trois parcours Windows Forms propres à chaque rôle à des opérations directes sur SQL Server. Le dépôt conserve des extraits de code, le schéma et des preuves d'interface, plutôt qu'une compilation exécutable. |

| EN | TR | DE | ES | FR |
| --- | --- | --- | --- | --- |
| Source Archive | Kaynak Arşivi | Quellarchiv | Archivo de código fuente | Archive de code source |

## Older archive project — Porto 25

| Locale | Project overview |
| --- | --- |
| EN | Porto 25 is a frontend practice repository focused on building a clean portfolio / landing page interface with Tailwind CSS. It represents an earlier personal-branding and layout experiment before the current full portfolio system. |
| TR | Porto 25, Tailwind CSS ile temiz bir portfolyo / landing page arayüzü oluşturmayı hedefleyen frontend pratik reposudur. Güncel kapsamlı portfolyo sisteminden önceki kişisel marka ve layout denemelerinden birini temsil eder. |
| DE | Porto 25 ist ein Frontend-Übungsrepository für eine klare Portfolio- und Landingpage-Oberfläche mit Tailwind CSS. Es steht für ein früheres Experiment zu persönlicher Marke und Layout, noch vor dem heutigen Portfolio-System. |
| ES | Porto 25 es un repositorio de práctica de frontend centrado en construir una interfaz limpia de portafolio y landing page con Tailwind CSS. Representa un experimento anterior de marca personal y maquetación, previo al sistema de portafolio actual. |
| FR | Porto 25 est un dépôt d'entraînement frontend centré sur la création d'une interface de portfolio et de landing page épurée avec Tailwind CSS. Il représente une expérimentation antérieure de marque personnelle et de mise en page, avant le système de portfolio actuel. |

## Request

| Locale | Success copy |
| --- | --- |
| EN | Your request was received and recorded. I will get back to you shortly. You can also reach me directly at: |
| TR | Talebiniz alındı ve kaydedildi. En kısa sürede dönüş yapacağım. Dilersen doğrudan e-posta da gönderebilirsin: |
| DE | Ihre Anfrage ist eingegangen und wurde gespeichert. Ich melde mich in Kürze. Sie erreichen mich auch direkt unter: |
| ES | Su solicitud se ha recibido y registrado. Le responderé en breve. También puede contactarme directamente en: |
| FR | Votre demande a bien été reçue et enregistrée. Je reviens vers vous rapidement. Vous pouvez aussi me joindre directement à : |

| Locale | Timeout copy |
| --- | --- |
| EN | The request timed out and could not be confirmed as sent. Your details are still in the form — please try again, or email: |
| TR | Talep zaman aşımına uğradı ve gönderildiği doğrulanamadı. Bilgilerin formda duruyor; tekrar deneyebilir veya e-posta ile ulaşabilirsin: |
| DE | Die Anfrage lief in eine Zeitüberschreitung und konnte nicht als gesendet bestätigt werden. Ihre Angaben stehen weiterhin im Formular — bitte versuchen Sie es erneut oder schreiben Sie an: |
| ES | La solicitud superó el tiempo de espera y no se pudo confirmar su envío. Sus datos siguen en el formulario: inténtelo de nuevo o escriba a: |
| FR | La demande a dépassé le délai d'attente et n'a pas pu être confirmée comme envoyée. Vos informations restent dans le formulaire : réessayez ou écrivez à : |

| EN | TR | DE | ES | FR |
| --- | --- | --- | --- | --- |
| Send Request | Talebi Gönder | Anfrage senden | Enviar solicitud | Envoyer la demande |

## Recruiter Mode

| Locale | Lead copy |
| --- | --- |
| EN | A concise, evidence-based profile for conversational AI, solution engineering, LLM evaluation, workflow automation and software opportunities. |
| TR | Conversational AI, solution engineering, LLM değerlendirme, workflow otomasyonu ve yazılım fırsatları için kısa ve kanıt odaklı profil özeti. |
| DE | Ein kompaktes, belegbasiertes Profil für Positionen in Conversational AI, Solution Engineering, LLM-Evaluation, Workflow-Automatisierung und Softwareentwicklung. |
| ES | Un perfil conciso y basado en evidencia para oportunidades en conversational AI, solution engineering, evaluación de LLM, automatización de flujos y desarrollo de software. |
| FR | Un profil concis et fondé sur des preuves pour des opportunités en conversational AI, solution engineering, évaluation de LLM, automatisation de workflows et développement logiciel. |

## Ajoop

| Locale | Greeting |
| --- | --- |
| EN | Hey, I am Ajoop. I can quickly explain Kaan's skills, projects, AI experience, Joyday work, CV and contact options. Choose a question or type a keyword. |
| TR | Selam, ben Ajoop. Kaan'ın yeteneklerini, projelerini, AI deneyimini, Joyday çalışmalarını, CV ve iletişim seçeneklerini hızlıca anlatabilirim. Bir soru seçebilir veya anahtar kelime yazabilirsin. |
| DE | Hallo, ich bin Ajoop. Ich erkläre Ihnen schnell Kaans Fähigkeiten, Projekte, AI-Erfahrung, die Joyday-Arbeit, den Lebenslauf und die Kontaktmöglichkeiten. Wählen Sie eine Frage oder tippen Sie ein Stichwort. |
| ES | Hola, soy Ajoop. Puedo explicarle rápidamente las capacidades de Kaan, sus proyectos, su experiencia en AI, el trabajo de Joyday, el currículum y las opciones de contacto. Elija una pregunta o escriba una palabra clave. |
| FR | Bonjour, je suis Ajoop. Je peux vous présenter rapidement les compétences de Kaan, ses projets, son expérience en AI, le travail Joyday, son CV et les moyens de le contacter. Choisissez une question ou saisissez un mot-clé. |

Ajoop quick-action and intent IDs are language-neutral and omitted from locale
packs, so translated labels cannot change intent identity.

## Game — Career Adventure

| Locale | Hero instruction |
| --- | --- |
| EN | Combine books, tools, code skills and AI workflow experience. Reach the final Job Offer object and complete the career merge. |
| TR | Kitapları, araçları, yazılım becerilerini ve AI workflow deneyimini birleştir. Son Job Offer nesnesine ulaş ve kariyer merge'ünü tamamla. |
| DE | Kombinieren Sie Bücher, Werkzeuge, Programmierkenntnisse und Erfahrung mit AI-Workflows. Erreichen Sie das finale Objekt „Jobangebot“ und schließen Sie den Karriere-Merge ab. |
| ES | Combine libros, herramientas, conocimientos de programación y experiencia en flujos de AI. Llegue al objeto final de oferta de trabajo y complete la fusión profesional. |
| FR | Combinez livres, outils, compétences en programmation et expérience des workflows d'AI. Atteignez l'objet final « offre d'emploi » et terminez la fusion de carrière. |

## Navigation, language and theme controls

| EN | TR | DE | ES | FR |
| --- | --- | --- | --- | --- |
| Home | Ana Sayfa | Startseite | Inicio | Accueil |
| Works | Projeler | Projekte | Proyectos | Projets |
| Games | Oyunlar | Spiele | Juegos | Jeux |
| Experience | Deneyim | Erfahrung | Experiencia | Expérience |
| Certificates | Sertifikalar | Zertifikate | Certificados | Certificats |
| Request | Talep | Anfrage | Solicitud | Demande |
| About | Hakkımda | Über mich | Sobre mí | À propos |
| Language | Dil | Sprache | Idioma | Langue |
| Language selector | Dil seçici | Sprachauswahl | Selector de idioma | Sélecteur de langue |
| Open navigation | Navigasyonu aç | Navigation öffnen | Abrir navegación | Ouvrir la navigation |
| Close navigation | Navigasyonu kapat | Navigation schließen | Cerrar navegación | Fermer la navigation |
| Dark | Koyu | Dunkel | Oscuro | Sombre |
| Light | Açık | Hell | Claro | Clair |
| Switch to dark theme | Koyu temaya geç | Zum dunklen Design wechseln | Cambiar al tema oscuro | Passer au thème sombre |
| Search | Ara | Suche | Buscar | Rechercher |
| Recruiter Mode | İK Modu | Recruiter Mode | Recruiter Mode | Recruiter Mode |

## Release checkpoint

The owner-reviewed tone, registers and deliberately preserved technical English
terms are unchanged. Five-locale activation enables the production selector,
same-locale canonicals, reciprocal `hreflang`, English `x-default` and the
five-locale sitemap without changing translation copy.
