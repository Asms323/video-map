// The kit the houses of the map are dressed from: where in models/fronts.jpg each front and each stuff
// lies, and its measures. Written by tools/fronts/build.py out of tools/fronts/fronts.json: not by hand.
// (Places are in spots of that picture, across then down; see js/fronts.js for what is made of them.)

export const KIT = {
 "size": [
  2048,
  2048
 ],
 "fronts": [
  {
   "name": "band",
   "tone": [
    0.7,
    0.594,
    0.507
   ],
   "wall": {
    "height": 3.2,
    "perMetre": 76.875,
    "v": [
     362.6,
     608.6
    ],
    "pieces": [
     [
      8.0,
      28.4,
      "plain"
     ],
     [
      28.4,
      307.4,
      "fixed"
     ],
     [
      307.4,
      670.4,
      "plain"
     ],
     [
      670.4,
      775.4,
      "fixed"
     ],
     [
      775.4,
      1004.0,
      "plain"
     ]
    ],
    "lamps": [
     [
      764.0,
      434.6,
      771.2,
      447.8
     ]
    ]
   },
   "house": {
    "perMetre": 66.6,
    "rects": [
     [
      314.0,
      8.0,
      842.6,
      362.6
     ],
     [
      222.2,
      65.6,
      314.0,
      362.6
     ]
    ],
    "plain": [
     328.4,
     299.0,
     508.4,
     353.0
    ],
    "plainPerMetre": 22.2,
    "panes": [
     [
      338.0,
      181.4,
      369.2,
      234.2
     ],
     [
      537.8,
      183.8,
      621.8,
      281.6
     ],
     [
      687.8,
      183.8,
      771.2,
      281.6
     ]
    ]
   }
  },
  {
   "name": "wood",
   "tone": [
    0.817,
    0.745,
    0.67
   ],
   "wall": {
    "height": 3.0,
    "perMetre": 82.0,
    "v": [
     423,
     669
    ],
    "pieces": [
     [
      1032,
      1192,
      "plain"
     ],
     [
      1192,
      1260,
      "optional"
     ],
     [
      1260,
      1365,
      "plain"
     ],
     [
      1365,
      1432,
      "optional"
     ],
     [
      1432,
      1537,
      "plain"
     ],
     [
      1537,
      1604,
      "optional"
     ],
     [
      1604,
      1687,
      "plain"
     ],
     [
      1687,
      1957,
      "fixed"
     ]
    ],
    "lamps": []
   },
   "house": {
    "perMetre": 75,
    "rects": [
     [
      1167,
      281,
      1877,
      423
     ],
     [
      1257,
      8,
      1614,
      281
     ],
     [
      1614,
      54,
      1817,
      281
     ],
     [
      1614,
      54,
      1877,
      101
     ]
    ],
    "plain": [
     1232,
     297,
     1592,
     359
    ],
    "plainPerMetre": 37.5,
    "panes": [
     [
      1339,
      144,
      1380,
      258
     ],
     [
      1394,
      144,
      1436,
      258
     ],
     [
      1449,
      144,
      1491,
      258
     ],
     [
      1684,
      172,
      1720,
      275
     ]
    ]
   }
  },
  {
   "name": "white",
   "tone": [
    0.842,
    0.841,
    0.851
   ],
   "wall": {
    "height": 2.7,
    "perMetre": 65.556,
    "v": [
     986,
     1163
    ],
    "pieces": [
     [
      8,
      101,
      "fixed"
     ],
     [
      101,
      440,
      "fixed"
     ],
     [
      440,
      478,
      "fixed"
     ],
     [
      478,
      803,
      "plain"
     ],
     [
      803,
      933,
      "fixed"
     ],
     [
      933,
      1014,
      "plain"
     ]
    ],
    "lamps": [
     [
      65,
      1013,
      75,
      1025
     ],
     [
      456,
      1013,
      463,
      1025
     ]
    ]
   },
   "house": {
    "perMetre": 60,
    "rects": [
     [
      146,
      858,
      484,
      986
     ],
     [
      269,
      714,
      422,
      858
     ],
     [
      211,
      662,
      567,
      714
     ],
     [
      422,
      714,
      567,
      986
     ],
     [
      567,
      625,
      834,
      986
     ]
    ],
    "plain": [
     574,
     635,
     644,
     933
    ],
    "plainPerMetre": 20.0,
    "panes": [
     [
      305,
      752,
      408,
      857
     ],
     [
      649,
      717,
      758,
      872
     ],
     [
      649,
      948,
      758,
      986
     ]
    ]
   }
  },
  {
   "name": "limestone",
   "tone": [
    0.706,
    0.628,
    0.551
   ],
   "wall": {
    "height": 3.0,
    "perMetre": 56.0,
    "v": [
     1070,
     1238
    ],
    "pieces": [
     [
      1032,
      1577,
      "plain"
     ],
     [
      1577,
      1873,
      "fixed"
     ]
    ],
    "lamps": []
   },
   "house": {
    "perMetre": 50,
    "rects": [
     [
      1230,
      745,
      1854,
      1070
     ],
     [
      1197,
      685,
      1887,
      745
     ]
    ],
    "plain": [
     1036,
     1074,
     1573,
     1234
    ],
    "plainPerMetre": 56.0,
    "panes": [
     [
      1302,
      806,
      1355,
      920
     ],
     [
      1371,
      806,
      1424,
      920
     ],
     [
      1513,
      806,
      1566,
      920
     ],
     [
      1660,
      806,
      1711,
      920
     ],
     [
      1729,
      806,
      1780,
      920
     ],
     [
      1304,
      1020,
      1354,
      1070
     ],
     [
      1374,
      1020,
      1424,
      1070
     ]
    ]
   }
  }
 ],
 "stuff": {
  "floor": [
   11,
   1182,
   133,
   1304
  ],
  "paving": [
   1035,
   1257,
   1157,
   1379
  ],
  "white": [
   11,
   1326,
   133,
   1448
  ],
  "unit": [
   1035,
   1401,
   1157,
   1523
  ],
  "dark": [
   11,
   1470,
   133,
   1592
  ]
 }
};
