// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// SYNTHETIC TEST DATA. Expected downloads of the fixtures golden (docs/TESTING.md, fixtures
// golden) for fixtures/statements.js, written by node test/smoke/fixtures-golden.js
// --update: the provider's page in environment E0 (en-US, UTC) with the frozen clock, loaded
// with the rendered fixtures through the picker, then for each mode in button order the
// ranges full, first and last, each followed by clickAll() (the card buttons in DOM order,
// then the toolbar). Each record is a capture record; every one equalled the downloads
// hook's Node rebuild of the same state when it was written. Review it before committing;
// regenerate it with --update after any change to the fixtures or to the code the page runs.
module.exports = {
  marker: "SYNTHETIC TEST DATA",
  env: "E0",
  clock: "2026-01-02T03:04:06Z",
  inputs: [
    { name: "20260201.pdf", size: 4667, sha256: "70ac70cd5a5525a8dc5d8482567ac8a0047b3151085885104b7b90982040443f" },
    { name: "20260301.pdf", size: 3479, sha256: "905400738ce9f074cd4508497ef5bbe7972b4d02953a76824b7a648727988bea" },
    { name: "20260501.pdf", size: 2806, sha256: "102e86fbbc8e58956e78b412c156bd1714c37e9e6db0d16e8fcdcec1ab748f22" },
    { name: "cashback-20260201.pdf", size: 2570, sha256: "f2b327ac8900f4cbcbd95aab82b6821302c7b9aa6fec9eaa6792f20ac33cf8a7" },
    { name: "20260201_copy.pdf", size: 4667, sha256: "70ac70cd5a5525a8dc5d8482567ac8a0047b3151085885104b7b90982040443f" },
  ],
  states: [
    { id: "balance/full", mode: "balance", from: "2026-01", to: "2026-05", records: [
      { trigger: "card", account: "Example Cashback", card: "Example Cashback", kind: "transactions", name: "Example Cashback - transactions - 2026-01_to_2026-05.csv", type: "text/csv", size: 114, sha256: "8b17b1eaf60c474f17ad992dfadc1f23e612fadd9c5427758e1664e056d4b560" },
      { trigger: "card", account: "Example Cashback", card: "Example Cashback", kind: "qif", name: "Example Cashback - 2026-01_to_2026-05.qif", type: "text/csv", size: 155, sha256: "c956e3ecf76f8b390daaafbe5f2be9b3b6284ce2be77e0b3abdbe4fa4b874714" },
      { trigger: "card", account: "Example Platinum", card: "Example Platinum", kind: "transactions", name: "Example Platinum - transactions - 2026-01_to_2026-05.csv", type: "text/csv", size: 878, sha256: "b1747556dd7b684a6ac891d3394281030aaa3027d9bcf0971c81efde776b6934" },
      { trigger: "card", account: "Example Platinum", card: "Example Platinum", kind: "qif", name: "Example Platinum - 2026-01_to_2026-05.qif", type: "text/csv", size: 926, sha256: "790bfd3db08f8c415ede02a7f1ade5636707d3abbe5bd4273b2b6215759204f3" },
      { trigger: "accounts", account: null, card: null, kind: null, name: "HSBC SG Credit Card accounts - 2026-01_to_2026-05.csv", type: "text/csv", size: 148, sha256: "8ae122e318ae62604a4b3acec70000277be9f9785afd9eef3e5ba2c0328805ba" },
      { trigger: "combined", account: null, card: null, kind: null, name: "HSBC SG Credit Card all accounts - transactions - 2026-01_to_2026-05.csv", type: "text/csv", size: 1172, sha256: "0206d949cfc2726ee3079ab1f0ed9825643d08fb45a4b121a8923c4da179280e" },
      { trigger: "zip", account: null, card: null, kind: null, name: "hsbc-sg-creditcard-csv-2026-01_to_2026-05.zip", type: "application/zip", size: 3117, sha256: "3da6fc8c9cd2542b4f8781eb64841f80db4bb47c889129603986bf8a5f54a394", entries: [
        { name: "HSBC SG Credit Card accounts - 2026-01_to_2026-05.csv", size: 148, crc32: 1687145044, sha256: "8ae122e318ae62604a4b3acec70000277be9f9785afd9eef3e5ba2c0328805ba", dosTime: 6275, dosDate: 23586 },
        { name: "Example Cashback - transactions - 2026-01_to_2026-05.csv", size: 114, crc32: 3129510523, sha256: "8b17b1eaf60c474f17ad992dfadc1f23e612fadd9c5427758e1664e056d4b560", dosTime: 6275, dosDate: 23586 },
        { name: "Example Cashback - 2026-01_to_2026-05.qif", size: 155, crc32: 1187433307, sha256: "c956e3ecf76f8b390daaafbe5f2be9b3b6284ce2be77e0b3abdbe4fa4b874714", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum - transactions - 2026-01_to_2026-05.csv", size: 878, crc32: 3409722278, sha256: "b1747556dd7b684a6ac891d3394281030aaa3027d9bcf0971c81efde776b6934", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum - 2026-01_to_2026-05.qif", size: 926, crc32: 3762869893, sha256: "790bfd3db08f8c415ede02a7f1ade5636707d3abbe5bd4273b2b6215759204f3", dosTime: 6275, dosDate: 23586 },
      ] },
    ] },
    { id: "balance/first", mode: "balance", from: "2026-01", to: "2026-01", records: [
      { trigger: "card", account: "Example Cashback", card: "Example Cashback", kind: "transactions", name: "Example Cashback - transactions - 2026-01.csv", type: "text/csv", size: 114, sha256: "8b17b1eaf60c474f17ad992dfadc1f23e612fadd9c5427758e1664e056d4b560" },
      { trigger: "card", account: "Example Cashback", card: "Example Cashback", kind: "qif", name: "Example Cashback - 2026-01.qif", type: "text/csv", size: 155, sha256: "c956e3ecf76f8b390daaafbe5f2be9b3b6284ce2be77e0b3abdbe4fa4b874714" },
      { trigger: "card", account: "Example Platinum", card: "Example Platinum", kind: "transactions", name: "Example Platinum - transactions - 2026-01.csv", type: "text/csv", size: 356, sha256: "813219f66e6f6909e56c0f58c8e1f38b81a28eba14dfa0b782feb890aaf95faf" },
      { trigger: "card", account: "Example Platinum", card: "Example Platinum", kind: "qif", name: "Example Platinum - 2026-01.qif", type: "text/csv", size: 396, sha256: "22834a410d5145d88c360ed095aeb9fd6591ad6be49e70dc8d663680ebf5ebd7" },
      { trigger: "accounts", account: null, card: null, kind: null, name: "HSBC SG Credit Card accounts - 2026-01.csv", type: "text/csv", size: 148, sha256: "8ae122e318ae62604a4b3acec70000277be9f9785afd9eef3e5ba2c0328805ba" },
      { trigger: "combined", account: null, card: null, kind: null, name: "HSBC SG Credit Card all accounts - transactions - 2026-01.csv", type: "text/csv", size: 531, sha256: "2e7e7d1b88f217c23b0242ca7cabbd2489256e166f9c92428daf5568f7f60d49" },
      { trigger: "zip", account: null, card: null, kind: null, name: "hsbc-sg-creditcard-csv-2026-01_to_2026-01.zip", type: "application/zip", size: 1955, sha256: "0ba7df1a39038b08a7e2bc455e465129422d1783ce7b5ca685f5acaad33a5faf", entries: [
        { name: "HSBC SG Credit Card accounts - 2026-01.csv", size: 148, crc32: 1687145044, sha256: "8ae122e318ae62604a4b3acec70000277be9f9785afd9eef3e5ba2c0328805ba", dosTime: 6275, dosDate: 23586 },
        { name: "Example Cashback - transactions - 2026-01.csv", size: 114, crc32: 3129510523, sha256: "8b17b1eaf60c474f17ad992dfadc1f23e612fadd9c5427758e1664e056d4b560", dosTime: 6275, dosDate: 23586 },
        { name: "Example Cashback - 2026-01.qif", size: 155, crc32: 1187433307, sha256: "c956e3ecf76f8b390daaafbe5f2be9b3b6284ce2be77e0b3abdbe4fa4b874714", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum - transactions - 2026-01.csv", size: 356, crc32: 2137060232, sha256: "813219f66e6f6909e56c0f58c8e1f38b81a28eba14dfa0b782feb890aaf95faf", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum - 2026-01.qif", size: 396, crc32: 3730917869, sha256: "22834a410d5145d88c360ed095aeb9fd6591ad6be49e70dc8d663680ebf5ebd7", dosTime: 6275, dosDate: 23586 },
      ] },
    ] },
    { id: "balance/last", mode: "balance", from: "2026-05", to: "2026-05", records: [
      { trigger: "accounts", account: null, card: null, kind: null, name: "HSBC SG Credit Card accounts - 2026-05.csv", type: "text/csv", size: 48, sha256: "d80c5d41f4256aad423919241a78392dd7a654de844b8f92f06bd7c56d4c9659" },
      { trigger: "combined", account: null, card: null, kind: null, name: "HSBC SG Credit Card all accounts - transactions - 2026-05.csv", type: "text/csv", size: 40, sha256: "14cf8af330829aef3a030095f3f76d8187fed7bed570e2d3d2eda360b2aa4658" },
      { trigger: "zip", account: null, card: null, kind: null, name: "hsbc-sg-creditcard-csv-2026-05_to_2026-05.zip", type: "application/zip", size: 230, sha256: "494660c4ecd1e62427bdf6c5f6b4ace524285eace3d09c91d8a65550f07dc448", entries: [
        { name: "HSBC SG Credit Card accounts - 2026-05.csv", size: 48, crc32: 2032365674, sha256: "d80c5d41f4256aad423919241a78392dd7a654de844b8f92f06bd7c56d4c9659", dosTime: 6275, dosDate: 23586 },
      ] },
    ] },
    { id: "tradelog/full", mode: "tradelog", from: "2026-01", to: "2026-05", records: [
      { trigger: "card", account: "Example Cashback", card: "Example Cashback", kind: "transactions", name: "Example Cashback - transactions - 2026-01_to_2026-05.csv", type: "text/csv", size: 114, sha256: "8b17b1eaf60c474f17ad992dfadc1f23e612fadd9c5427758e1664e056d4b560" },
      { trigger: "card", account: "Example Cashback", card: "Example Cashback", kind: "qif", name: "Example Cashback - 2026-01_to_2026-05.qif", type: "text/csv", size: 155, sha256: "c956e3ecf76f8b390daaafbe5f2be9b3b6284ce2be77e0b3abdbe4fa4b874714" },
      { trigger: "card", account: "Example Platinum", card: "Example Platinum", kind: "transactions", name: "Example Platinum - transactions - 2026-01_to_2026-05.csv", type: "text/csv", size: 878, sha256: "b1747556dd7b684a6ac891d3394281030aaa3027d9bcf0971c81efde776b6934" },
      { trigger: "card", account: "Example Platinum", card: "Example Platinum", kind: "qif", name: "Example Platinum - 2026-01_to_2026-05.qif", type: "text/csv", size: 926, sha256: "790bfd3db08f8c415ede02a7f1ade5636707d3abbe5bd4273b2b6215759204f3" },
      { trigger: "accounts", account: null, card: null, kind: null, name: "HSBC SG Credit Card accounts - 2026-01_to_2026-05.csv", type: "text/csv", size: 148, sha256: "8ae122e318ae62604a4b3acec70000277be9f9785afd9eef3e5ba2c0328805ba" },
      { trigger: "combined", account: null, card: null, kind: null, name: "HSBC SG Credit Card all accounts - transactions - 2026-01_to_2026-05.csv", type: "text/csv", size: 1172, sha256: "0206d949cfc2726ee3079ab1f0ed9825643d08fb45a4b121a8923c4da179280e" },
      { trigger: "zip", account: null, card: null, kind: null, name: "hsbc-sg-creditcard-csv-2026-01_to_2026-05.zip", type: "application/zip", size: 3117, sha256: "3da6fc8c9cd2542b4f8781eb64841f80db4bb47c889129603986bf8a5f54a394", entries: [
        { name: "HSBC SG Credit Card accounts - 2026-01_to_2026-05.csv", size: 148, crc32: 1687145044, sha256: "8ae122e318ae62604a4b3acec70000277be9f9785afd9eef3e5ba2c0328805ba", dosTime: 6275, dosDate: 23586 },
        { name: "Example Cashback - transactions - 2026-01_to_2026-05.csv", size: 114, crc32: 3129510523, sha256: "8b17b1eaf60c474f17ad992dfadc1f23e612fadd9c5427758e1664e056d4b560", dosTime: 6275, dosDate: 23586 },
        { name: "Example Cashback - 2026-01_to_2026-05.qif", size: 155, crc32: 1187433307, sha256: "c956e3ecf76f8b390daaafbe5f2be9b3b6284ce2be77e0b3abdbe4fa4b874714", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum - transactions - 2026-01_to_2026-05.csv", size: 878, crc32: 3409722278, sha256: "b1747556dd7b684a6ac891d3394281030aaa3027d9bcf0971c81efde776b6934", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum - 2026-01_to_2026-05.qif", size: 926, crc32: 3762869893, sha256: "790bfd3db08f8c415ede02a7f1ade5636707d3abbe5bd4273b2b6215759204f3", dosTime: 6275, dosDate: 23586 },
      ] },
    ] },
    { id: "tradelog/first", mode: "tradelog", from: "2026-01", to: "2026-01", records: [
      { trigger: "card", account: "Example Cashback", card: "Example Cashback", kind: "transactions", name: "Example Cashback - transactions - 2026-01.csv", type: "text/csv", size: 114, sha256: "8b17b1eaf60c474f17ad992dfadc1f23e612fadd9c5427758e1664e056d4b560" },
      { trigger: "card", account: "Example Cashback", card: "Example Cashback", kind: "qif", name: "Example Cashback - 2026-01.qif", type: "text/csv", size: 155, sha256: "c956e3ecf76f8b390daaafbe5f2be9b3b6284ce2be77e0b3abdbe4fa4b874714" },
      { trigger: "card", account: "Example Platinum", card: "Example Platinum", kind: "transactions", name: "Example Platinum - transactions - 2026-01.csv", type: "text/csv", size: 356, sha256: "813219f66e6f6909e56c0f58c8e1f38b81a28eba14dfa0b782feb890aaf95faf" },
      { trigger: "card", account: "Example Platinum", card: "Example Platinum", kind: "qif", name: "Example Platinum - 2026-01.qif", type: "text/csv", size: 396, sha256: "22834a410d5145d88c360ed095aeb9fd6591ad6be49e70dc8d663680ebf5ebd7" },
      { trigger: "accounts", account: null, card: null, kind: null, name: "HSBC SG Credit Card accounts - 2026-01.csv", type: "text/csv", size: 148, sha256: "8ae122e318ae62604a4b3acec70000277be9f9785afd9eef3e5ba2c0328805ba" },
      { trigger: "combined", account: null, card: null, kind: null, name: "HSBC SG Credit Card all accounts - transactions - 2026-01.csv", type: "text/csv", size: 531, sha256: "2e7e7d1b88f217c23b0242ca7cabbd2489256e166f9c92428daf5568f7f60d49" },
      { trigger: "zip", account: null, card: null, kind: null, name: "hsbc-sg-creditcard-csv-2026-01_to_2026-01.zip", type: "application/zip", size: 1955, sha256: "0ba7df1a39038b08a7e2bc455e465129422d1783ce7b5ca685f5acaad33a5faf", entries: [
        { name: "HSBC SG Credit Card accounts - 2026-01.csv", size: 148, crc32: 1687145044, sha256: "8ae122e318ae62604a4b3acec70000277be9f9785afd9eef3e5ba2c0328805ba", dosTime: 6275, dosDate: 23586 },
        { name: "Example Cashback - transactions - 2026-01.csv", size: 114, crc32: 3129510523, sha256: "8b17b1eaf60c474f17ad992dfadc1f23e612fadd9c5427758e1664e056d4b560", dosTime: 6275, dosDate: 23586 },
        { name: "Example Cashback - 2026-01.qif", size: 155, crc32: 1187433307, sha256: "c956e3ecf76f8b390daaafbe5f2be9b3b6284ce2be77e0b3abdbe4fa4b874714", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum - transactions - 2026-01.csv", size: 356, crc32: 2137060232, sha256: "813219f66e6f6909e56c0f58c8e1f38b81a28eba14dfa0b782feb890aaf95faf", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum - 2026-01.qif", size: 396, crc32: 3730917869, sha256: "22834a410d5145d88c360ed095aeb9fd6591ad6be49e70dc8d663680ebf5ebd7", dosTime: 6275, dosDate: 23586 },
      ] },
    ] },
    { id: "tradelog/last", mode: "tradelog", from: "2026-05", to: "2026-05", records: [
      { trigger: "accounts", account: null, card: null, kind: null, name: "HSBC SG Credit Card accounts - 2026-05.csv", type: "text/csv", size: 48, sha256: "d80c5d41f4256aad423919241a78392dd7a654de844b8f92f06bd7c56d4c9659" },
      { trigger: "combined", account: null, card: null, kind: null, name: "HSBC SG Credit Card all accounts - transactions - 2026-05.csv", type: "text/csv", size: 40, sha256: "14cf8af330829aef3a030095f3f76d8187fed7bed570e2d3d2eda360b2aa4658" },
      { trigger: "zip", account: null, card: null, kind: null, name: "hsbc-sg-creditcard-csv-2026-05_to_2026-05.zip", type: "application/zip", size: 230, sha256: "494660c4ecd1e62427bdf6c5f6b4ace524285eace3d09c91d8a65550f07dc448", entries: [
        { name: "HSBC SG Credit Card accounts - 2026-05.csv", size: 48, crc32: 2032365674, sha256: "d80c5d41f4256aad423919241a78392dd7a654de844b8f92f06bd7c56d4c9659", dosTime: 6275, dosDate: 23586 },
      ] },
    ] },
    { id: "holdings/full", mode: "holdings", from: "2026-01", to: "2026-05", records: [
      { trigger: "card", account: "Example Cashback", card: "Example Cashback", kind: "transactions", name: "Example Cashback - transactions - 2026-01_to_2026-05.csv", type: "text/csv", size: 114, sha256: "8b17b1eaf60c474f17ad992dfadc1f23e612fadd9c5427758e1664e056d4b560" },
      { trigger: "card", account: "Example Cashback", card: "Example Cashback", kind: "qif", name: "Example Cashback - 2026-01_to_2026-05.qif", type: "text/csv", size: 155, sha256: "c956e3ecf76f8b390daaafbe5f2be9b3b6284ce2be77e0b3abdbe4fa4b874714" },
      { trigger: "card", account: "Example Platinum", card: "Example Platinum", kind: "transactions", name: "Example Platinum - transactions - 2026-01_to_2026-05.csv", type: "text/csv", size: 878, sha256: "b1747556dd7b684a6ac891d3394281030aaa3027d9bcf0971c81efde776b6934" },
      { trigger: "card", account: "Example Platinum", card: "Example Platinum", kind: "qif", name: "Example Platinum - 2026-01_to_2026-05.qif", type: "text/csv", size: 926, sha256: "790bfd3db08f8c415ede02a7f1ade5636707d3abbe5bd4273b2b6215759204f3" },
      { trigger: "accounts", account: null, card: null, kind: null, name: "HSBC SG Credit Card accounts - 2026-01_to_2026-05.csv", type: "text/csv", size: 148, sha256: "8ae122e318ae62604a4b3acec70000277be9f9785afd9eef3e5ba2c0328805ba" },
      { trigger: "combined", account: null, card: null, kind: null, name: "HSBC SG Credit Card all accounts - transactions - 2026-01_to_2026-05.csv", type: "text/csv", size: 1172, sha256: "0206d949cfc2726ee3079ab1f0ed9825643d08fb45a4b121a8923c4da179280e" },
      { trigger: "zip", account: null, card: null, kind: null, name: "hsbc-sg-creditcard-csv-2026-01_to_2026-05.zip", type: "application/zip", size: 3117, sha256: "3da6fc8c9cd2542b4f8781eb64841f80db4bb47c889129603986bf8a5f54a394", entries: [
        { name: "HSBC SG Credit Card accounts - 2026-01_to_2026-05.csv", size: 148, crc32: 1687145044, sha256: "8ae122e318ae62604a4b3acec70000277be9f9785afd9eef3e5ba2c0328805ba", dosTime: 6275, dosDate: 23586 },
        { name: "Example Cashback - transactions - 2026-01_to_2026-05.csv", size: 114, crc32: 3129510523, sha256: "8b17b1eaf60c474f17ad992dfadc1f23e612fadd9c5427758e1664e056d4b560", dosTime: 6275, dosDate: 23586 },
        { name: "Example Cashback - 2026-01_to_2026-05.qif", size: 155, crc32: 1187433307, sha256: "c956e3ecf76f8b390daaafbe5f2be9b3b6284ce2be77e0b3abdbe4fa4b874714", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum - transactions - 2026-01_to_2026-05.csv", size: 878, crc32: 3409722278, sha256: "b1747556dd7b684a6ac891d3394281030aaa3027d9bcf0971c81efde776b6934", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum - 2026-01_to_2026-05.qif", size: 926, crc32: 3762869893, sha256: "790bfd3db08f8c415ede02a7f1ade5636707d3abbe5bd4273b2b6215759204f3", dosTime: 6275, dosDate: 23586 },
      ] },
    ] },
    { id: "holdings/first", mode: "holdings", from: "2026-01", to: "2026-01", records: [
      { trigger: "card", account: "Example Cashback", card: "Example Cashback", kind: "transactions", name: "Example Cashback - transactions - 2026-01.csv", type: "text/csv", size: 114, sha256: "8b17b1eaf60c474f17ad992dfadc1f23e612fadd9c5427758e1664e056d4b560" },
      { trigger: "card", account: "Example Cashback", card: "Example Cashback", kind: "qif", name: "Example Cashback - 2026-01.qif", type: "text/csv", size: 155, sha256: "c956e3ecf76f8b390daaafbe5f2be9b3b6284ce2be77e0b3abdbe4fa4b874714" },
      { trigger: "card", account: "Example Platinum", card: "Example Platinum", kind: "transactions", name: "Example Platinum - transactions - 2026-01.csv", type: "text/csv", size: 356, sha256: "813219f66e6f6909e56c0f58c8e1f38b81a28eba14dfa0b782feb890aaf95faf" },
      { trigger: "card", account: "Example Platinum", card: "Example Platinum", kind: "qif", name: "Example Platinum - 2026-01.qif", type: "text/csv", size: 396, sha256: "22834a410d5145d88c360ed095aeb9fd6591ad6be49e70dc8d663680ebf5ebd7" },
      { trigger: "accounts", account: null, card: null, kind: null, name: "HSBC SG Credit Card accounts - 2026-01.csv", type: "text/csv", size: 148, sha256: "8ae122e318ae62604a4b3acec70000277be9f9785afd9eef3e5ba2c0328805ba" },
      { trigger: "combined", account: null, card: null, kind: null, name: "HSBC SG Credit Card all accounts - transactions - 2026-01.csv", type: "text/csv", size: 531, sha256: "2e7e7d1b88f217c23b0242ca7cabbd2489256e166f9c92428daf5568f7f60d49" },
      { trigger: "zip", account: null, card: null, kind: null, name: "hsbc-sg-creditcard-csv-2026-01_to_2026-01.zip", type: "application/zip", size: 1955, sha256: "0ba7df1a39038b08a7e2bc455e465129422d1783ce7b5ca685f5acaad33a5faf", entries: [
        { name: "HSBC SG Credit Card accounts - 2026-01.csv", size: 148, crc32: 1687145044, sha256: "8ae122e318ae62604a4b3acec70000277be9f9785afd9eef3e5ba2c0328805ba", dosTime: 6275, dosDate: 23586 },
        { name: "Example Cashback - transactions - 2026-01.csv", size: 114, crc32: 3129510523, sha256: "8b17b1eaf60c474f17ad992dfadc1f23e612fadd9c5427758e1664e056d4b560", dosTime: 6275, dosDate: 23586 },
        { name: "Example Cashback - 2026-01.qif", size: 155, crc32: 1187433307, sha256: "c956e3ecf76f8b390daaafbe5f2be9b3b6284ce2be77e0b3abdbe4fa4b874714", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum - transactions - 2026-01.csv", size: 356, crc32: 2137060232, sha256: "813219f66e6f6909e56c0f58c8e1f38b81a28eba14dfa0b782feb890aaf95faf", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum - 2026-01.qif", size: 396, crc32: 3730917869, sha256: "22834a410d5145d88c360ed095aeb9fd6591ad6be49e70dc8d663680ebf5ebd7", dosTime: 6275, dosDate: 23586 },
      ] },
    ] },
    { id: "holdings/last", mode: "holdings", from: "2026-05", to: "2026-05", records: [
      { trigger: "accounts", account: null, card: null, kind: null, name: "HSBC SG Credit Card accounts - 2026-05.csv", type: "text/csv", size: 48, sha256: "d80c5d41f4256aad423919241a78392dd7a654de844b8f92f06bd7c56d4c9659" },
      { trigger: "combined", account: null, card: null, kind: null, name: "HSBC SG Credit Card all accounts - transactions - 2026-05.csv", type: "text/csv", size: 40, sha256: "14cf8af330829aef3a030095f3f76d8187fed7bed570e2d3d2eda360b2aa4658" },
      { trigger: "zip", account: null, card: null, kind: null, name: "hsbc-sg-creditcard-csv-2026-05_to_2026-05.zip", type: "application/zip", size: 230, sha256: "494660c4ecd1e62427bdf6c5f6b4ace524285eace3d09c91d8a65550f07dc448", entries: [
        { name: "HSBC SG Credit Card accounts - 2026-05.csv", size: 48, crc32: 2032365674, sha256: "d80c5d41f4256aad423919241a78392dd7a654de844b8f92f06bd7c56d4c9659", dosTime: 6275, dosDate: 23586 },
      ] },
    ] },
  ],
};
