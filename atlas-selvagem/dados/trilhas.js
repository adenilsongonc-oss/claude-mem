// Fonte única dos registros de trilha. A página só renderiza a partir deste bloco.
// Campo ausente = null (a interface mostra "—" e o layout não quebra).
// tracado/pontos/cume: coordenadas normalizadas num quadro de 100 x 70 (margem 6), desenho estilizado, não GPS.
// perfil: 40 amostras de 0 a 1 (forma do perfil altimétrico); fontePerfil: "print" | "gpx".
// Pendência: o registro antigo tinha esforço "Leve" (texto); falta o número de 1 a 10.
export const TRILHAS = [
  {
    "id": "pico-das-cabras",
    "nome": "Pico das Cabras",
    "data": "2026-10-25",
    "local": "Joaquim Egídio, Campinas-SP",
    "distanciaKm": 15.16,
    "desnivelPos": 382,
    "desnivelNeg": null,
    "altitudeMax": 1086,
    "tempoTotalMin": null,
    "tempoMovMin": null,
    "dificuldade": null,
    "tipo": "circular",
    "wikiloc": "https://loc.wiki/t/293221725?wa=share",
    "esforco": null,
    "notas": "Caminhada em trilha de estrada de terra. Alguns pontos de entrada em propriedade particular com vistas",
    "clima": "Nublado/Chuva",
    "companhia": "Sozinho",
    "tracado": "M6.0 17.4 L9.0 18.4 L21.0 15.4 L24.0 15.0 L27.0 12.6 L35.0 11.8 L44.0 13.4 L61.0 13.6 L66.0 11.4 L68.0 9.0 L72.0 10.0 L77.6 7.4 L82.0 13.0 L86.0 18.0 L87.6 25.4 L91.6 28.0 L94.0 32.0 L92.0 35.0 L90.4 41.0 L93.0 48.0 L89.0 53.0 L82.0 54.6 L81.0 60.0 L64.0 62.6 L58.0 62.0 L56.0 57.0 L55.2 46.0 L58.0 44.0 L56.0 41.0 L52.0 40.0 L49.0 35.0 L44.0 28.0 L38.0 25.0 L34.0 25.4 L23.0 27.0 L16.0 25.0 L11.0 21.0 L9.0 18.4 L6.0 17.4",
    "pontos": [
      [
        6.0,
        17.4
      ],
      [
        9.0,
        18.4
      ],
      [
        21.0,
        15.4
      ],
      [
        24.0,
        15.0
      ],
      [
        27.0,
        12.6
      ],
      [
        35.0,
        11.8
      ],
      [
        44.0,
        13.4
      ],
      [
        61.0,
        13.6
      ],
      [
        66.0,
        11.4
      ],
      [
        68.0,
        9.0
      ],
      [
        72.0,
        10.0
      ],
      [
        77.6,
        7.4
      ],
      [
        82.0,
        13.0
      ],
      [
        86.0,
        18.0
      ],
      [
        87.6,
        25.4
      ],
      [
        91.6,
        28.0
      ],
      [
        94.0,
        32.0
      ],
      [
        92.0,
        35.0
      ],
      [
        90.4,
        41.0
      ],
      [
        93.0,
        48.0
      ],
      [
        89.0,
        53.0
      ],
      [
        82.0,
        54.6
      ],
      [
        81.0,
        60.0
      ],
      [
        64.0,
        62.6
      ],
      [
        58.0,
        62.0
      ],
      [
        56.0,
        57.0
      ],
      [
        55.2,
        46.0
      ],
      [
        58.0,
        44.0
      ],
      [
        56.0,
        41.0
      ],
      [
        52.0,
        40.0
      ],
      [
        49.0,
        35.0
      ],
      [
        44.0,
        28.0
      ],
      [
        38.0,
        25.0
      ],
      [
        34.0,
        25.4
      ],
      [
        23.0,
        27.0
      ],
      [
        16.0,
        25.0
      ],
      [
        11.0,
        21.0
      ],
      [
        9.0,
        18.4
      ],
      [
        6.0,
        17.4
      ]
    ],
    "cume": [
      81.0,
      55.4
    ],
    "perfil": [
      0.0,
      0.013,
      0.026,
      0.045,
      0.064,
      0.083,
      0.115,
      0.178,
      0.259,
      0.367,
      0.469,
      0.564,
      0.634,
      0.685,
      0.731,
      0.776,
      0.83,
      0.887,
      0.928,
      0.966,
      0.986,
      1.0,
      0.917,
      0.861,
      0.94,
      0.921,
      0.902,
      0.883,
      0.818,
      0.678,
      0.556,
      0.462,
      0.513,
      0.509,
      0.471,
      0.401,
      0.318,
      0.225,
      0.13,
      0.06
    ],
    "fontePerfil": "print"
  }
];
