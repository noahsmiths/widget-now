# Widget Now

Sick of always checking the same sites over and over again for updates? Widget Now lets you turn any webpage into a live widget, and get notified when the data changes.

### [Try it out here!](https://brave-hornet-708.convex.site/)

---

*Made for the Convex All Gas Hackathon*

---

## How it works

```mermaid
flowchart TD
    A["User submits a public URL and optional instructions"] --> B["Convex creates a source and starts a durable workflow"]
    B --> C["Firecrawl scrapes the web page"]
    W["Public web page"] --> C
    C --> D{"Initial generation or refresh?"}
    D -- Initial --> E["Markdown, page title, and screenshot"]
    E --> F["OpenAI extracts structured fields from the markdown"]
    E --> P["OpenAI derives a widget color palette from the screenshot"]
    F --> G["OpenAI generates square and rectangular widget designs"]
    P --> G
    G --> H["Convex validates and stores the title, fields, and designs"]
    H --> I["The app reactively renders the generated widget choices"]

    I --> Q["User saves a widget"]
    Q --> J["Convex schedules refreshes for saved widgets"]
    J --> C
    D -- Refresh --> R["Fresh markdown"]
    R --> S["OpenAI refreshes the existing structured field values"]
    S --> K["Convex stores the new values and evaluates email watches"]
    K --> L{"Did a watch condition trigger?"}
    L -- No --> J
    L -- Yes --> M["AgentMail sends the alert email"]
    M --> N["User replies with updated notification instructions"]
    N --> O["AgentMail receives the email and calls the signed webhook"]
    O --> T["Convex verifies and deduplicates the webhook, then starts a mail workflow"]
    T --> U["Convex fetches the reply from AgentMail and validates its sender and thread"]
    U --> V["OpenAI interprets the reply as an update, pause, or help command"]
    V --> X["Convex validates and applies the updated watch instructions"]
    X --> Y["AgentMail sends a confirmation reply"]
    Y --> J

    classDef convex fill:#f1e8ff,stroke:#6f3cc3,color:#211238;
    classDef firecrawl fill:#fff0e6,stroke:#e05d22,color:#431a08;
    classDef openai fill:#e7f7f2,stroke:#16856b,color:#083a2f;
    classDef agentmail fill:#eaf2ff,stroke:#3973c6,color:#10294f;
    class B,H,J,K,T,U,X convex;
    class C firecrawl;
    class F,P,G,S,V openai;
    class M,O,Y agentmail;
```
