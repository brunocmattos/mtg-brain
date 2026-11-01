# Método: construir uma potência de Commander (bracket 3)

Passo a passo reutilizável para transformar um comandante numa **verdadeira potência**
dentro das regras (bracket 3, ≤ US$400 reais via ManaPool). Validado no rebuild do
**Meren of Clan Nel Toth** (resultado: poder 87 "Altíssimo", bracket 3, $386 real).

> Roda como workflow multi-agente, mas a **lógica** vale pra qualquer build manual.
> Script de referência: `workflows/scripts/meren-powerhouse-*.js`.

## As 6 fases

### 1. Estratégia (a partir do comandante)
Leia o oracle do comandante e responda: **o que ele transforma em vantagem?**
Defina o plano de jogo central, as **condições de vitória** (2–4) e os **pilares** com
**contagem-alvo** que somam ~99 (incluindo terrenos). Decida combos só **incidentais**.

### 2. Sourcing (uma busca por função)
Pra cada pilar, **consulte o banco real** (não confie em memória de preço/legalidade):
- Filtro de cor: `color_identity <@ '{...}'::text[]` (inclui incolor).
- Rankeie por `edhrec_rank ASC NULLS LAST` + sinergia, não poder bruto.
- Preço REAL: `COALESCE(manapool_prices.usd, MIN(scryfall usd))`. **Atualize a ManaPool antes** (`ingest manapool`) — ela envelhece e subestima.
- Marque Game Changers (limite 3 no bracket 3).

### 3. Sinergia / combos
Mapeie **pacotes** (conjuntos que se potencializam) e **linhas de combo** consultando a
tabela `combos` (`card_names <@` o pool). Classifique cada combo: incidental (ok) vs.
trava trivial precoce (joga pro bracket 4 — evitar).

### 4. Construção
Monte 100 (comandante + 99) respeitando os alvos dos pilares, **≤ 3 GC**, **≤ $400 real**,
curva baixa o suficiente pro plano. Decida o **nº de tutores pela estratégia**: deck de
**valor/sinergia → 2–3 tutores** (cada tutor caro tira slot de uma peça sinérgica e não
faz nada no board); deck de **combo → mais tutores**.

### 5. Avaliação adversarial (5 lentes, céticas)
Pontue 0–10 e exija fixes concretos: **fecha-jogo**, **defesa**, **consistência/mana**,
**sinergia/combo** (funciona mesmo? sem nonbo?), **regras/bracket/orçamento** (cor, GC,
100 cartas, preço — validar com SQL).

### 6. Revisão
Aplique os fixes de severidade alta/média sem quebrar as restrições. **Re-valide tudo no
banco**: nomes existem, identidade de cor, contagem de GC, soma = 100, preço real ≤ $400.

## Guard-rails do bracket 3
- **≤ 3 Game Changers** (ver `GAME_CHANGERS` em `mtg_brain/queries.py`).
- **Sem** destruição em massa de terrenos (MLD).
- **Sem** encadear turnos extras.
- Combos de 2 cartas OK **se incidentais** (peças boas isoladas, não montadas cedo/trivial).

## Template de pilares (ponto de partida, ajuste pelo comandante)
| Pilar | Alvo |
|---|---|
| Terrenos | 36–37 |
| Rampa | 10–12 |
| Compra / vantagem | 10–12 |
| Interação (remoção + edict) | 8–10 |
| Board wipes (recuperáveis) | 2–3 |
| Motor temático (sac/tokens/etc.) | 8–12 |
| Finalizadores | 2–3 |
| Tutores | 2–3 (valor) / 4+ (combo) |

---

## Exemplo trabalhado: Meren of Clan Nel Toth (Golgari)

**Comandante:** cada criatura sua que morre → +1 exp (permanente); todo end step reanima
de graça uma criatura do cemitério com MV ≤ exp. É remoção + rampa + card advantage num
corpo só — o gargalo são **sac outlets grátis**.

**Estratégia:** aristocrats Golgari de atrito incremental. Rampar → Meren turno 4–5 →
loopar criaturas de ETB/morte com sac outlet grátis → instalar drenos + travas
(Grave Pact/Dictate) → fechar por dreno de aristocrata, Gray Merchant reanimado, ou
overrun (Craterhoof). Wipes são **ferramenta pró-Meren** (você se recupera melhor).

**Combo incidental:** Mikaeus, the Unhallowed + Walking Ballista (dano infinito) — peças
boas isoladas, aparecem tarde. Quase-loops de valor: Gravecrawler/Reassembling Skeleton +
sac outlet grátis.

**Lista final por função (99 + Meren):**
- **Sac outlets (5):** Ashnod's Altar, Carrion Feeder, Viscera Seer, Woe Strider, Yawgmoth, Thran Physician
- **Fodder recursivo (4):** Bloodghast, Gravecrawler, Reassembling Skeleton, Spore Frog
- **Aristocratas/travas (7):** Blood Artist, Zulaport Cutthroat, Bastion of Remembrance, Poison-Tip Archer, Syr Konrad, Grave Pact, Dictate of Erebos
- **Interação (13):** Assassin's Trophy, Beast Within, Putrefy, Go for the Throat, Pernicious Deed, Fleshbag Marauder, Merciless Executioner, Plaguecrafter, Ravenous Chupacabra, Shriekmaw, Caustic Caterpillar, Undying Malice, Veil of Summer
- **Wipes (3):** Damnation, Toxic Deluge, Living Death
- **Compra (10):** Skullclamp, Phyrexian Arena, Midnight Reaper, Grim Haruspex, Morbid Opportunist, Deadly Dispute, Village Rites, Night's Whisper, Greater Good, Bolas's Citadel
- **Recursão (5):** Eternal Witness, Animate Dead, Victimize, Phyrexian Reclamation, Regrowth
- **Rampa (9):** Sol Ring, Arcane Signet, Golgari Signet, Talisman of Resilience, Sakura-Tribe Elder, Farhaven Elf, Wood Elves, Cultivate, Solemn Simulacrum
- **Tutores (3):** Demonic Tutor, Vampiric Tutor, Diabolic Intent
- **Finalizadores (3):** Craterhoof Behemoth, Gray Merchant of Asphodel, Mikaeus, the Unhallowed
- **Utility (1):** Lightning Greaves
- **Terrenos (36):** 21 não-básicos (Cabal Coffers, Overgrown Tomb, Woodland Cemetery, Twilight Mire, Hissing Quagmire, Llanowar Wastes, Blooming Marsh, Deathcap Glade, Necroblossom Snarl, Nurturing Peatland, Castle Locthwain, Deserted Temple, Grim Backwoods, Mortuary Mire, Bojuka Bog, High Market, Krosan Verge, Myriad Landscape, Path of Ancestry, Exotic Orchard, Command Tower) + 7 Forest + 8 Swamp

**Game Changers (3/3):** Demonic Tutor, Vampiric Tutor, Bolas's Citadel.

**Resultado:** poder **87** ("Altíssimo poder"), bracket **3**, custo real **$386.97**,
CMC médio **2.81**, 36 terrenos / 10 rampa / 15 compra / 14 interação.

**Avaliação adversarial:** fecha-jogo 7.5 · consistência 7.5 · sinergia 6.5 · regras 6.5 ·
**defesa 5.5** (ponto fraco: Golgari não tem counters; mitigado com Veil of Summer +
Lightning Greaves + Spore Frog/fog).

**Lição de orçamento:** os tutores caros (Demonic $62, Vampiric $45) são o maior gasto —
mantidos só porque cabem em 3 GC e a estratégia justifica 3 tutores. O resto do dinheiro
foi em **sinergia** (Yawgmoth, Grave Pact, Cabal Coffers), não em staples soltos.
