// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// SYNTHETIC TEST DATA. Expected downloads of the fixtures golden (docs/TESTING.md, fixtures
// golden) for fixtures/statements.js: the page built from this provider, in environment E0
// (en-US, UTC) with the frozen clock, loaded with the rendered workbook through the picker,
// then for each mode in button order the ranges full, first and last, each followed by
// clickAll() (the card's buttons in DOM order, then #zip). Each record is a capture record
// (trigger, account, card, kind, raw name, Blob MIME type, size, sha256, and for a zip its
// entries with CRC-32 and DOS time and date). Every record was checked against the downloads
// hook's Node rebuild of the same state (test.js through files.js) before it was written.
// Generated, then reviewed; regenerate with the fixtures golden's --update after any change to
// the fixtures, the parser, files.js, app.js or the core modules they use.
module.exports = {
  marker: "SYNTHETIC TEST DATA",
  env: "E0",
  clock: "2026-01-02T03:04:06Z",
  inputs: [
    { name: "synthetic-account-statement.xlsx", size: 12455, sha256: "c036581037affe4a8d7801996183b609371814e8523d65dd984bd8e34afcfccb" },
  ],
  states: [
    { id: "balance/full", mode: "balance", from: "2025-01", to: "2025-03", records: [
      { trigger: "card", account: null, card: "eToro", kind: "transactions", name: "eToro - transactions - 2025-01_to_2025-03.csv", type: "text/csv", size: 625, sha256: "ed535e1cf8d316ae27b5fd73e43bc238deb27ae710dda6eeaf83b2f842279ab8" },
      { trigger: "card", account: null, card: "eToro", kind: "qif", name: "eToro - 2025-01_to_2025-03.qif", type: "text/csv", size: 656, sha256: "68a6ce944516e2927b4dd9db8a2344530f1bb06d2075bdcc1bc18e3af36cda70" },
      { trigger: "card", account: null, card: "eToro", kind: "balances", name: "eToro - balances - 2025-01_to_2025-03.csv", type: "text/csv", size: 90, sha256: "0e5743e9b28958a08e0ac7262f2f1174eb32afd60d1993e198e561651070d3c8" },
      { trigger: "card", account: null, card: "eToro", kind: "accounts", name: "eToro accounts - 2025-01_to_2025-03.csv", type: "text/csv", size: 85, sha256: "a81cc60c825af4e23f0ee16e18aae3fc451cac8e700782d0984bcf8b19e292da" },
      { trigger: "zip", account: null, card: null, kind: null, name: "etoro-csv-2025-01_to_2025-03.zip", type: "application/zip", size: 2092, sha256: "7a78ee28d710441603afdeab726550c2dbf01678e1b3deaf331a9ba6574f5547", entries: [
        { name: "eToro - transactions - 2025-01_to_2025-03.csv", size: 625, crc32: 2362873968, sha256: "ed535e1cf8d316ae27b5fd73e43bc238deb27ae710dda6eeaf83b2f842279ab8", dosTime: 6275, dosDate: 23586 },
        { name: "eToro - 2025-01_to_2025-03.qif", size: 656, crc32: 1514592205, sha256: "68a6ce944516e2927b4dd9db8a2344530f1bb06d2075bdcc1bc18e3af36cda70", dosTime: 6275, dosDate: 23586 },
        { name: "eToro - balances - 2025-01_to_2025-03.csv", size: 90, crc32: 42848076, sha256: "0e5743e9b28958a08e0ac7262f2f1174eb32afd60d1993e198e561651070d3c8", dosTime: 6275, dosDate: 23586 },
        { name: "eToro accounts - 2025-01_to_2025-03.csv", size: 85, crc32: 287269702, sha256: "a81cc60c825af4e23f0ee16e18aae3fc451cac8e700782d0984bcf8b19e292da", dosTime: 6275, dosDate: 23586 },
      ] },
    ] },
    { id: "balance/first", mode: "balance", from: "2025-01", to: "2025-01", records: [
      { trigger: "card", account: null, card: "eToro", kind: "transactions", name: "eToro - transactions - 2025-01.csv", type: "text/csv", size: 233, sha256: "144d7947f99355296d0268b4044881bf1c171abbeddc79a44d6824a64a4d36ac" },
      { trigger: "card", account: null, card: "eToro", kind: "qif", name: "eToro - 2025-01.qif", type: "text/csv", size: 260, sha256: "28f261a8828b9b2d3c262eaa90d67bb84fc02b4d6fa954a477ebaf21209ea64c" },
      { trigger: "card", account: null, card: "eToro", kind: "balances", name: "eToro - balances - 2025-01.csv", type: "text/csv", size: 45, sha256: "949c8b242d8e23af681a4013355ca5da17a16db8230e2494590c8aa7d743cdd4" },
      { trigger: "card", account: null, card: "eToro", kind: "accounts", name: "eToro accounts - 2025-01.csv", type: "text/csv", size: 85, sha256: "a81cc60c825af4e23f0ee16e18aae3fc451cac8e700782d0984bcf8b19e292da" },
      { trigger: "zip", account: null, card: null, kind: null, name: "etoro-csv-2025-01.zip", type: "application/zip", size: 1171, sha256: "a0e3fe85e8c7f4c70855820c2ffb1bf16396c0958f0f6bc3a05607b71da62187", entries: [
        { name: "eToro - transactions - 2025-01.csv", size: 233, crc32: 4156500067, sha256: "144d7947f99355296d0268b4044881bf1c171abbeddc79a44d6824a64a4d36ac", dosTime: 6275, dosDate: 23586 },
        { name: "eToro - 2025-01.qif", size: 260, crc32: 854020604, sha256: "28f261a8828b9b2d3c262eaa90d67bb84fc02b4d6fa954a477ebaf21209ea64c", dosTime: 6275, dosDate: 23586 },
        { name: "eToro - balances - 2025-01.csv", size: 45, crc32: 2447109096, sha256: "949c8b242d8e23af681a4013355ca5da17a16db8230e2494590c8aa7d743cdd4", dosTime: 6275, dosDate: 23586 },
        { name: "eToro accounts - 2025-01.csv", size: 85, crc32: 287269702, sha256: "a81cc60c825af4e23f0ee16e18aae3fc451cac8e700782d0984bcf8b19e292da", dosTime: 6275, dosDate: 23586 },
      ] },
    ] },
    { id: "balance/last", mode: "balance", from: "2025-03", to: "2025-03", records: [
      { trigger: "card", account: null, card: "eToro", kind: "transactions", name: "eToro - transactions - 2025-03.csv", type: "text/csv", size: 210, sha256: "d1604922c4310b6b85750aadb1f8fc45f18687818a56f29fe0c3c8d789d459fd" },
      { trigger: "card", account: null, card: "eToro", kind: "qif", name: "eToro - 2025-03.qif", type: "text/csv", size: 239, sha256: "7e76ae34541c69dc6c84df6c92127998cc722815abf2e307de9a70e604786bb8" },
      { trigger: "card", account: null, card: "eToro", kind: "balances", name: "eToro - balances - 2025-03.csv", type: "text/csv", size: 45, sha256: "14151563204c6775ad0dbb798aa81faece7179e0ba20b6d63dde5c3c56bca45d" },
      { trigger: "card", account: null, card: "eToro", kind: "accounts", name: "eToro accounts - 2025-03.csv", type: "text/csv", size: 87, sha256: "b52da76825fb7e6693e4ea9ecb84714a4b50669d957f08420b54fa3e355baef7" },
      { trigger: "zip", account: null, card: null, kind: null, name: "etoro-csv-2025-03.zip", type: "application/zip", size: 1129, sha256: "ab288ffdf2fd714dfb083bdef659fd472ae5cd87c8802b7b97fb677f0300a6d8", entries: [
        { name: "eToro - transactions - 2025-03.csv", size: 210, crc32: 1526177282, sha256: "d1604922c4310b6b85750aadb1f8fc45f18687818a56f29fe0c3c8d789d459fd", dosTime: 6275, dosDate: 23586 },
        { name: "eToro - 2025-03.qif", size: 239, crc32: 2947867632, sha256: "7e76ae34541c69dc6c84df6c92127998cc722815abf2e307de9a70e604786bb8", dosTime: 6275, dosDate: 23586 },
        { name: "eToro - balances - 2025-03.csv", size: 45, crc32: 4223716769, sha256: "14151563204c6775ad0dbb798aa81faece7179e0ba20b6d63dde5c3c56bca45d", dosTime: 6275, dosDate: 23586 },
        { name: "eToro accounts - 2025-03.csv", size: 87, crc32: 363953356, sha256: "b52da76825fb7e6693e4ea9ecb84714a4b50669d957f08420b54fa3e355baef7", dosTime: 6275, dosDate: 23586 },
      ] },
    ] },
    { id: "month/full", mode: "month", from: "2025-01", to: "2025-03", records: [
      { trigger: "card", account: null, card: "eToro", kind: "transactions", name: "eToro - transactions - 2025-01_to_2025-03.csv", type: "text/csv", size: 881, sha256: "17463c652639ab06d6950c4826fca9ec741dba993f07b5d93c222d46615ecf0f" },
      { trigger: "card", account: null, card: "eToro", kind: "qif", name: "eToro - 2025-01_to_2025-03.qif", type: "text/csv", size: 922, sha256: "7f9782c4a50542aab2fa4e8902dfd5525a50619c1a2708cd97828115ab24dd0a" },
      { trigger: "card", account: null, card: "eToro", kind: "balances", name: "eToro - balances - 2025-01_to_2025-03.csv", type: "text/csv", size: 90, sha256: "0e5743e9b28958a08e0ac7262f2f1174eb32afd60d1993e198e561651070d3c8" },
      { trigger: "card", account: null, card: "eToro", kind: "accounts", name: "eToro accounts - 2025-01_to_2025-03.csv", type: "text/csv", size: 85, sha256: "a81cc60c825af4e23f0ee16e18aae3fc451cac8e700782d0984bcf8b19e292da" },
      { trigger: "zip", account: null, card: null, kind: null, name: "etoro-csv-2025-01_to_2025-03.zip", type: "application/zip", size: 2614, sha256: "91e14707205863a292eb7c1b3be1a9f3a201e567ab2645c3cbafd76238681278", entries: [
        { name: "eToro - transactions - 2025-01_to_2025-03.csv", size: 881, crc32: 134962770, sha256: "17463c652639ab06d6950c4826fca9ec741dba993f07b5d93c222d46615ecf0f", dosTime: 6275, dosDate: 23586 },
        { name: "eToro - 2025-01_to_2025-03.qif", size: 922, crc32: 3494301514, sha256: "7f9782c4a50542aab2fa4e8902dfd5525a50619c1a2708cd97828115ab24dd0a", dosTime: 6275, dosDate: 23586 },
        { name: "eToro - balances - 2025-01_to_2025-03.csv", size: 90, crc32: 42848076, sha256: "0e5743e9b28958a08e0ac7262f2f1174eb32afd60d1993e198e561651070d3c8", dosTime: 6275, dosDate: 23586 },
        { name: "eToro accounts - 2025-01_to_2025-03.csv", size: 85, crc32: 287269702, sha256: "a81cc60c825af4e23f0ee16e18aae3fc451cac8e700782d0984bcf8b19e292da", dosTime: 6275, dosDate: 23586 },
      ] },
    ] },
    { id: "month/first", mode: "month", from: "2025-01", to: "2025-01", records: [
      { trigger: "card", account: null, card: "eToro", kind: "transactions", name: "eToro - transactions - 2025-01.csv", type: "text/csv", size: 322, sha256: "1b024021987d107ecc58a8ae1c70521d1fcd5f5f64eedd61035c6f062e6c7b61" },
      { trigger: "card", account: null, card: "eToro", kind: "qif", name: "eToro - 2025-01.qif", type: "text/csv", size: 353, sha256: "5f1b2de0afd6c945a6b783f76c0b7f074945cb6fee567799070fba922b2fc67c" },
      { trigger: "card", account: null, card: "eToro", kind: "balances", name: "eToro - balances - 2025-01.csv", type: "text/csv", size: 45, sha256: "949c8b242d8e23af681a4013355ca5da17a16db8230e2494590c8aa7d743cdd4" },
      { trigger: "card", account: null, card: "eToro", kind: "accounts", name: "eToro accounts - 2025-01.csv", type: "text/csv", size: 85, sha256: "a81cc60c825af4e23f0ee16e18aae3fc451cac8e700782d0984bcf8b19e292da" },
      { trigger: "zip", account: null, card: null, kind: null, name: "etoro-csv-2025-01.zip", type: "application/zip", size: 1353, sha256: "30db4fdebf33621fc7c2755437bdff4cd14df644c50b760a96e3b16718a9f063", entries: [
        { name: "eToro - transactions - 2025-01.csv", size: 322, crc32: 807719523, sha256: "1b024021987d107ecc58a8ae1c70521d1fcd5f5f64eedd61035c6f062e6c7b61", dosTime: 6275, dosDate: 23586 },
        { name: "eToro - 2025-01.qif", size: 353, crc32: 2551384495, sha256: "5f1b2de0afd6c945a6b783f76c0b7f074945cb6fee567799070fba922b2fc67c", dosTime: 6275, dosDate: 23586 },
        { name: "eToro - balances - 2025-01.csv", size: 45, crc32: 2447109096, sha256: "949c8b242d8e23af681a4013355ca5da17a16db8230e2494590c8aa7d743cdd4", dosTime: 6275, dosDate: 23586 },
        { name: "eToro accounts - 2025-01.csv", size: 85, crc32: 287269702, sha256: "a81cc60c825af4e23f0ee16e18aae3fc451cac8e700782d0984bcf8b19e292da", dosTime: 6275, dosDate: 23586 },
      ] },
    ] },
    { id: "month/last", mode: "month", from: "2025-03", to: "2025-03", records: [
      { trigger: "card", account: null, card: "eToro", kind: "transactions", name: "eToro - transactions - 2025-03.csv", type: "text/csv", size: 279, sha256: "cf1c9019217548ee6a3634c5afa933f9d3dc526d3eef0e2dd0907684037e751c" },
      { trigger: "card", account: null, card: "eToro", kind: "qif", name: "eToro - 2025-03.qif", type: "text/csv", size: 310, sha256: "e8c1033552e1bc11b07c65e755324de3f3a3abed8a4e07850bf0dd3e054e3330" },
      { trigger: "card", account: null, card: "eToro", kind: "balances", name: "eToro - balances - 2025-03.csv", type: "text/csv", size: 45, sha256: "14151563204c6775ad0dbb798aa81faece7179e0ba20b6d63dde5c3c56bca45d" },
      { trigger: "card", account: null, card: "eToro", kind: "accounts", name: "eToro accounts - 2025-03.csv", type: "text/csv", size: 87, sha256: "b52da76825fb7e6693e4ea9ecb84714a4b50669d957f08420b54fa3e355baef7" },
      { trigger: "zip", account: null, card: null, kind: null, name: "etoro-csv-2025-03.zip", type: "application/zip", size: 1269, sha256: "a3f67cca439b23a1a631c76fbf03c710c06b1b0bbcd36cf08632fd8a0be2642e", entries: [
        { name: "eToro - transactions - 2025-03.csv", size: 279, crc32: 3666832918, sha256: "cf1c9019217548ee6a3634c5afa933f9d3dc526d3eef0e2dd0907684037e751c", dosTime: 6275, dosDate: 23586 },
        { name: "eToro - 2025-03.qif", size: 310, crc32: 1754793934, sha256: "e8c1033552e1bc11b07c65e755324de3f3a3abed8a4e07850bf0dd3e054e3330", dosTime: 6275, dosDate: 23586 },
        { name: "eToro - balances - 2025-03.csv", size: 45, crc32: 4223716769, sha256: "14151563204c6775ad0dbb798aa81faece7179e0ba20b6d63dde5c3c56bca45d", dosTime: 6275, dosDate: 23586 },
        { name: "eToro accounts - 2025-03.csv", size: 87, crc32: 363953356, sha256: "b52da76825fb7e6693e4ea9ecb84714a4b50669d957f08420b54fa3e355baef7", dosTime: 6275, dosDate: 23586 },
      ] },
    ] },
    { id: "day/full", mode: "day", from: "2025-01", to: "2025-03", records: [
      { trigger: "card", account: null, card: "eToro", kind: "transactions", name: "eToro - transactions - 2025-01_to_2025-03.csv", type: "text/csv", size: 1017, sha256: "4da9ffd52e60d8624276059afe7fd4f7b1310ea4352d291d1ff619c38cb7a866" },
      { trigger: "card", account: null, card: "eToro", kind: "qif", name: "eToro - 2025-01_to_2025-03.qif", type: "text/csv", size: 1058, sha256: "1bef717b8b23a9d4561e8a212d4a3f2112a6e3d7fd899516f7f6b3054f5a3d67" },
      { trigger: "card", account: null, card: "eToro", kind: "balances", name: "eToro - balances - 2025-01_to_2025-03.csv", type: "text/csv", size: 113, sha256: "073dfe38bbfb4ea20869c3dec4dae08517a5d3f0055eef746f7d4a435c017da9" },
      { trigger: "card", account: null, card: "eToro", kind: "accounts", name: "eToro accounts - 2025-01_to_2025-03.csv", type: "text/csv", size: 85, sha256: "a81cc60c825af4e23f0ee16e18aae3fc451cac8e700782d0984bcf8b19e292da" },
      { trigger: "zip", account: null, card: null, kind: null, name: "etoro-csv-2025-01_to_2025-03.zip", type: "application/zip", size: 2909, sha256: "5e40f7ee6942e35ec54e9edfaf18b1541c228639dfbe6b322ab3dd389873c41a", entries: [
        { name: "eToro - transactions - 2025-01_to_2025-03.csv", size: 1017, crc32: 3070394786, sha256: "4da9ffd52e60d8624276059afe7fd4f7b1310ea4352d291d1ff619c38cb7a866", dosTime: 6275, dosDate: 23586 },
        { name: "eToro - 2025-01_to_2025-03.qif", size: 1058, crc32: 2287397264, sha256: "1bef717b8b23a9d4561e8a212d4a3f2112a6e3d7fd899516f7f6b3054f5a3d67", dosTime: 6275, dosDate: 23586 },
        { name: "eToro - balances - 2025-01_to_2025-03.csv", size: 113, crc32: 3275474817, sha256: "073dfe38bbfb4ea20869c3dec4dae08517a5d3f0055eef746f7d4a435c017da9", dosTime: 6275, dosDate: 23586 },
        { name: "eToro accounts - 2025-01_to_2025-03.csv", size: 85, crc32: 287269702, sha256: "a81cc60c825af4e23f0ee16e18aae3fc451cac8e700782d0984bcf8b19e292da", dosTime: 6275, dosDate: 23586 },
      ] },
    ] },
    { id: "day/first", mode: "day", from: "2025-01", to: "2025-01", records: [
      { trigger: "card", account: null, card: "eToro", kind: "transactions", name: "eToro - transactions - 2025-01.csv", type: "text/csv", size: 328, sha256: "304878107229232ec5a651868724ca94e13adc4831fbfff492f91991d3994c1e" },
      { trigger: "card", account: null, card: "eToro", kind: "qif", name: "eToro - 2025-01.qif", type: "text/csv", size: 359, sha256: "802bb2d76ae8848ff18bcb5b7ba078737974522cb9f4ff5dba1a0d5946053386" },
      { trigger: "card", account: null, card: "eToro", kind: "balances", name: "eToro - balances - 2025-01.csv", type: "text/csv", size: 45, sha256: "949c8b242d8e23af681a4013355ca5da17a16db8230e2494590c8aa7d743cdd4" },
      { trigger: "card", account: null, card: "eToro", kind: "accounts", name: "eToro accounts - 2025-01.csv", type: "text/csv", size: 85, sha256: "a81cc60c825af4e23f0ee16e18aae3fc451cac8e700782d0984bcf8b19e292da" },
      { trigger: "zip", account: null, card: null, kind: null, name: "etoro-csv-2025-01.zip", type: "application/zip", size: 1365, sha256: "7cfde39ad804224ed6b902c4944f8c6a816cc4da1591b264840910d12167392b", entries: [
        { name: "eToro - transactions - 2025-01.csv", size: 328, crc32: 3566889610, sha256: "304878107229232ec5a651868724ca94e13adc4831fbfff492f91991d3994c1e", dosTime: 6275, dosDate: 23586 },
        { name: "eToro - 2025-01.qif", size: 359, crc32: 2158749132, sha256: "802bb2d76ae8848ff18bcb5b7ba078737974522cb9f4ff5dba1a0d5946053386", dosTime: 6275, dosDate: 23586 },
        { name: "eToro - balances - 2025-01.csv", size: 45, crc32: 2447109096, sha256: "949c8b242d8e23af681a4013355ca5da17a16db8230e2494590c8aa7d743cdd4", dosTime: 6275, dosDate: 23586 },
        { name: "eToro accounts - 2025-01.csv", size: 85, crc32: 287269702, sha256: "a81cc60c825af4e23f0ee16e18aae3fc451cac8e700782d0984bcf8b19e292da", dosTime: 6275, dosDate: 23586 },
      ] },
    ] },
    { id: "day/last", mode: "day", from: "2025-03", to: "2025-03", records: [
      { trigger: "card", account: null, card: "eToro", kind: "transactions", name: "eToro - transactions - 2025-03.csv", type: "text/csv", size: 403, sha256: "ba3318d7c443b2f0f76f1cbf3a92a8e95fe569f1eea0f7bb8940b74003c68c8b" },
      { trigger: "card", account: null, card: "eToro", kind: "qif", name: "eToro - 2025-03.qif", type: "text/csv", size: 434, sha256: "5fb2ada5065d79fdf98212e9da3d29d4d09ce5f3e9242b1f5cbae058295236cd" },
      { trigger: "card", account: null, card: "eToro", kind: "balances", name: "eToro - balances - 2025-03.csv", type: "text/csv", size: 68, sha256: "41761aec93b393aaa3387cdea70afa5351d234605393daf4963e2031fdaed61e" },
      { trigger: "card", account: null, card: "eToro", kind: "accounts", name: "eToro accounts - 2025-03.csv", type: "text/csv", size: 87, sha256: "b52da76825fb7e6693e4ea9ecb84714a4b50669d957f08420b54fa3e355baef7" },
      { trigger: "zip", account: null, card: null, kind: null, name: "etoro-csv-2025-03.zip", type: "application/zip", size: 1540, sha256: "f083d745a20b9fe009424acf1aa685c27c49164217acfbdfffb83eb18e9601a1", entries: [
        { name: "eToro - transactions - 2025-03.csv", size: 403, crc32: 1902426820, sha256: "ba3318d7c443b2f0f76f1cbf3a92a8e95fe569f1eea0f7bb8940b74003c68c8b", dosTime: 6275, dosDate: 23586 },
        { name: "eToro - 2025-03.qif", size: 434, crc32: 3435468893, sha256: "5fb2ada5065d79fdf98212e9da3d29d4d09ce5f3e9242b1f5cbae058295236cd", dosTime: 6275, dosDate: 23586 },
        { name: "eToro - balances - 2025-03.csv", size: 68, crc32: 2063144170, sha256: "41761aec93b393aaa3387cdea70afa5351d234605393daf4963e2031fdaed61e", dosTime: 6275, dosDate: 23586 },
        { name: "eToro accounts - 2025-03.csv", size: 87, crc32: 363953356, sha256: "b52da76825fb7e6693e4ea9ecb84714a4b50669d957f08420b54fa3e355baef7", dosTime: 6275, dosDate: 23586 },
      ] },
    ] },
  ],
};
