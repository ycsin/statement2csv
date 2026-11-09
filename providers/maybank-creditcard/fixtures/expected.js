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
    { name: "1001_20260106.pdf", size: 3671, sha256: "3eb503f1453fba80d1c7111c59f2ee0c6801819ddf583363c1127daaa11f2b57" },
    { name: "1002_20260206.pdf", size: 4061, sha256: "805485cb2effc9cf6c09df2af7acbadc10ec9267f22ac1ae75697b1510173f35" },
    { name: "1004_20260406.pdf", size: 3211, sha256: "f3f3752effc72172c7ab56a1e6a5c8861a870057ea97511ced6e06661af84e4c" },
    { name: "2001_20260106.pdf", size: 2605, sha256: "ab4dcb750e3553d08160ee9181462968d46ded6ca82655392a9ac6b4285473d1" },
    { name: "2002_20260206.pdf", size: 2793, sha256: "8e41d502303b7da967a541db95248dde6c2e0306024945074f125299d3000243" },
    { name: "1001_20260106_copy.pdf", size: 3671, sha256: "3eb503f1453fba80d1c7111c59f2ee0c6801819ddf583363c1127daaa11f2b57" },
  ],
  states: [
    { id: "balance/full", mode: "balance", from: "2025-12", to: "2026-04", records: [
      { trigger: "card", account: "Example Gold Visa 7002", card: "Example Gold Visa 7002", kind: "transactions", name: "Example Gold Visa 7002 - transactions - 2025-12_to_2026-04.csv", type: "text/csv", size: 227, sha256: "13d9574b68c34ed409fe4454dc62f9a83ef07611082a88c0c32c7fc7647d0657" },
      { trigger: "card", account: "Example Gold Visa 7002", card: "Example Gold Visa 7002", kind: "qif", name: "Example Gold Visa 7002 - 2025-12_to_2026-04.qif", type: "text/csv", size: 276, sha256: "ac239f80a40f70ebb3a2d79785a00069d7015deaaf51cb85a81f6f06ab670967" },
      { trigger: "card", account: "Example Platinum Mastercard 3001", card: "Example Platinum Mastercard 3001", kind: "transactions", name: "Example Platinum Mastercard 3001 - transactions - 2025-12_to_2026-04.csv", type: "text/csv", size: 839, sha256: "f2852b364a0d199ea872c9e41b5d59ed0ea95221c816ed8e38186528481fc0d8" },
      { trigger: "card", account: "Example Platinum Mastercard 3001", card: "Example Platinum Mastercard 3001", kind: "qif", name: "Example Platinum Mastercard 3001 - 2025-12_to_2026-04.qif", type: "text/csv", size: 901, sha256: "d11d5f15b5a28b9ae37ff0e6df1ae005b02cfd601ca9f93b463b4bb6799616e8" },
      { trigger: "accounts", account: null, card: null, kind: null, name: "Maybank Credit Card accounts - 2025-12_to_2026-04.csv", type: "text/csv", size: 170, sha256: "02b3d53231dd0fe1ec79b6d58a4bfcf36eec1aec4e3752cf5663cd0b01dc7362" },
      { trigger: "combined", account: null, card: null, kind: null, name: "Maybank Credit Card all accounts - transactions - 2025-12_to_2026-04.csv", type: "text/csv", size: 1507, sha256: "803422a473dec396248bf4874addccb32bd6a13275847770475c30658aaa561d" },
      { trigger: "zip", account: null, card: null, kind: null, name: "maybank-creditcard-csv-2025-12_to_2026-04.zip", type: "application/zip", size: 3397, sha256: "04604eb40e44b87a350e6b6504d38d9710ce6ad9cc03569512c1dd2f35a61d74", entries: [
        { name: "Maybank Credit Card accounts - 2025-12_to_2026-04.csv", size: 170, crc32: 3728573013, sha256: "02b3d53231dd0fe1ec79b6d58a4bfcf36eec1aec4e3752cf5663cd0b01dc7362", dosTime: 6275, dosDate: 23586 },
        { name: "Example Gold Visa 7002 - transactions - 2025-12_to_2026-04.csv", size: 227, crc32: 4185429372, sha256: "13d9574b68c34ed409fe4454dc62f9a83ef07611082a88c0c32c7fc7647d0657", dosTime: 6275, dosDate: 23586 },
        { name: "Example Gold Visa 7002 - 2025-12_to_2026-04.qif", size: 276, crc32: 972863242, sha256: "ac239f80a40f70ebb3a2d79785a00069d7015deaaf51cb85a81f6f06ab670967", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum Mastercard 3001 - transactions - 2025-12_to_2026-04.csv", size: 839, crc32: 2276822980, sha256: "f2852b364a0d199ea872c9e41b5d59ed0ea95221c816ed8e38186528481fc0d8", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum Mastercard 3001 - 2025-12_to_2026-04.qif", size: 901, crc32: 111770442, sha256: "d11d5f15b5a28b9ae37ff0e6df1ae005b02cfd601ca9f93b463b4bb6799616e8", dosTime: 6275, dosDate: 23586 },
      ] },
    ] },
    { id: "balance/first", mode: "balance", from: "2025-12", to: "2025-12", records: [
      { trigger: "card", account: "Example Gold Visa 7002", card: "Example Gold Visa 7002", kind: "transactions", name: "Example Gold Visa 7002 - transactions - 2025-12.csv", type: "text/csv", size: 114, sha256: "6180973c3d8342fe6bb36e4cd0e7b9ea49d0d321b515a4f969306fe85e4a0c8c" },
      { trigger: "card", account: "Example Gold Visa 7002", card: "Example Gold Visa 7002", kind: "qif", name: "Example Gold Visa 7002 - 2025-12.qif", type: "text/csv", size: 161, sha256: "62f264ddb1c61fb65011feeabe360718830af873f807c90d98fa02252c2fe27f" },
      { trigger: "card", account: "Example Platinum Mastercard 3001", card: "Example Platinum Mastercard 3001", kind: "transactions", name: "Example Platinum Mastercard 3001 - transactions - 2025-12.csv", type: "text/csv", size: 297, sha256: "9d87708e0ec840252512cfa43917726345efa9bdca424585538b3be2fbc4df70" },
      { trigger: "card", account: "Example Platinum Mastercard 3001", card: "Example Platinum Mastercard 3001", kind: "qif", name: "Example Platinum Mastercard 3001 - 2025-12.qif", type: "text/csv", size: 351, sha256: "b927ecfcb67f0e16e75d99f6fe72222cd1fa9a1f82fa92b96dc1f3a5b46e61eb" },
      { trigger: "accounts", account: null, card: null, kind: null, name: "Maybank Credit Card accounts - 2025-12.csv", type: "text/csv", size: 170, sha256: "02b3d53231dd0fe1ec79b6d58a4bfcf36eec1aec4e3752cf5663cd0b01dc7362" },
      { trigger: "combined", account: null, card: null, kind: null, name: "Maybank Credit Card all accounts - transactions - 2025-12.csv", type: "text/csv", size: 509, sha256: "6863d21ca34ff3e18a030c5d0428b1f84c88f780be5fc309dcb482e89ef3aedd" },
      { trigger: "zip", account: null, card: null, kind: null, name: "maybank-creditcard-csv-2025-12_to_2025-12.zip", type: "application/zip", size: 1967, sha256: "bd80591a60ee5644d9dd42a82854c8b4c68f3b796f84d9daf8e6f6c6722de273", entries: [
        { name: "Maybank Credit Card accounts - 2025-12.csv", size: 170, crc32: 3728573013, sha256: "02b3d53231dd0fe1ec79b6d58a4bfcf36eec1aec4e3752cf5663cd0b01dc7362", dosTime: 6275, dosDate: 23586 },
        { name: "Example Gold Visa 7002 - transactions - 2025-12.csv", size: 114, crc32: 662546952, sha256: "6180973c3d8342fe6bb36e4cd0e7b9ea49d0d321b515a4f969306fe85e4a0c8c", dosTime: 6275, dosDate: 23586 },
        { name: "Example Gold Visa 7002 - 2025-12.qif", size: 161, crc32: 2815099567, sha256: "62f264ddb1c61fb65011feeabe360718830af873f807c90d98fa02252c2fe27f", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum Mastercard 3001 - transactions - 2025-12.csv", size: 297, crc32: 1783391358, sha256: "9d87708e0ec840252512cfa43917726345efa9bdca424585538b3be2fbc4df70", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum Mastercard 3001 - 2025-12.qif", size: 351, crc32: 1870802730, sha256: "b927ecfcb67f0e16e75d99f6fe72222cd1fa9a1f82fa92b96dc1f3a5b46e61eb", dosTime: 6275, dosDate: 23586 },
      ] },
    ] },
    { id: "balance/last", mode: "balance", from: "2026-04", to: "2026-04", records: [
      { trigger: "card", account: "Example Platinum Mastercard 3001", card: "Example Platinum Mastercard 3001", kind: "transactions", name: "Example Platinum Mastercard 3001 - transactions - 2026-04.csv", type: "text/csv", size: 78, sha256: "1ea68e2c56df82a6932dacbf753381264564592c0eb78857b052b931c5a5084a" },
      { trigger: "card", account: "Example Platinum Mastercard 3001", card: "Example Platinum Mastercard 3001", kind: "qif", name: "Example Platinum Mastercard 3001 - 2026-04.qif", type: "text/csv", size: 134, sha256: "da00c56ba2894d4a41249827d5d36123ea6dc88f9ba9f6033f4edc655d071eb0" },
      { trigger: "accounts", account: null, card: null, kind: null, name: "Maybank Credit Card accounts - 2026-04.csv", type: "text/csv", size: 114, sha256: "774c473c18a0de547062b9789144429d381d9313429041e37d543423abc17876" },
      { trigger: "combined", account: null, card: null, kind: null, name: "Maybank Credit Card all accounts - transactions - 2026-04.csv", type: "text/csv", size: 119, sha256: "9e457fff16abbf176f2b32c713eca8f98d8d498303a2c3bdd020822284da22d3" },
      { trigger: "zip", account: null, card: null, kind: null, name: "maybank-creditcard-csv-2026-04_to_2026-04.zip", type: "application/zip", size: 874, sha256: "91fc979a0cb8f0292b3286912cfae46ecbaaa51a28c740ba0b88efb8eef53e7c", entries: [
        { name: "Maybank Credit Card accounts - 2026-04.csv", size: 114, crc32: 158395422, sha256: "774c473c18a0de547062b9789144429d381d9313429041e37d543423abc17876", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum Mastercard 3001 - transactions - 2026-04.csv", size: 78, crc32: 4071725788, sha256: "1ea68e2c56df82a6932dacbf753381264564592c0eb78857b052b931c5a5084a", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum Mastercard 3001 - 2026-04.qif", size: 134, crc32: 428386143, sha256: "da00c56ba2894d4a41249827d5d36123ea6dc88f9ba9f6033f4edc655d071eb0", dosTime: 6275, dosDate: 23586 },
      ] },
    ] },
    { id: "tradelog/full", mode: "tradelog", from: "2025-12", to: "2026-04", records: [
      { trigger: "card", account: "Example Gold Visa 7002", card: "Example Gold Visa 7002", kind: "transactions", name: "Example Gold Visa 7002 - transactions - 2025-12_to_2026-04.csv", type: "text/csv", size: 227, sha256: "13d9574b68c34ed409fe4454dc62f9a83ef07611082a88c0c32c7fc7647d0657" },
      { trigger: "card", account: "Example Gold Visa 7002", card: "Example Gold Visa 7002", kind: "qif", name: "Example Gold Visa 7002 - 2025-12_to_2026-04.qif", type: "text/csv", size: 276, sha256: "ac239f80a40f70ebb3a2d79785a00069d7015deaaf51cb85a81f6f06ab670967" },
      { trigger: "card", account: "Example Platinum Mastercard 3001", card: "Example Platinum Mastercard 3001", kind: "transactions", name: "Example Platinum Mastercard 3001 - transactions - 2025-12_to_2026-04.csv", type: "text/csv", size: 839, sha256: "f2852b364a0d199ea872c9e41b5d59ed0ea95221c816ed8e38186528481fc0d8" },
      { trigger: "card", account: "Example Platinum Mastercard 3001", card: "Example Platinum Mastercard 3001", kind: "qif", name: "Example Platinum Mastercard 3001 - 2025-12_to_2026-04.qif", type: "text/csv", size: 901, sha256: "d11d5f15b5a28b9ae37ff0e6df1ae005b02cfd601ca9f93b463b4bb6799616e8" },
      { trigger: "accounts", account: null, card: null, kind: null, name: "Maybank Credit Card accounts - 2025-12_to_2026-04.csv", type: "text/csv", size: 170, sha256: "02b3d53231dd0fe1ec79b6d58a4bfcf36eec1aec4e3752cf5663cd0b01dc7362" },
      { trigger: "combined", account: null, card: null, kind: null, name: "Maybank Credit Card all accounts - transactions - 2025-12_to_2026-04.csv", type: "text/csv", size: 1507, sha256: "803422a473dec396248bf4874addccb32bd6a13275847770475c30658aaa561d" },
      { trigger: "zip", account: null, card: null, kind: null, name: "maybank-creditcard-csv-2025-12_to_2026-04.zip", type: "application/zip", size: 3397, sha256: "04604eb40e44b87a350e6b6504d38d9710ce6ad9cc03569512c1dd2f35a61d74", entries: [
        { name: "Maybank Credit Card accounts - 2025-12_to_2026-04.csv", size: 170, crc32: 3728573013, sha256: "02b3d53231dd0fe1ec79b6d58a4bfcf36eec1aec4e3752cf5663cd0b01dc7362", dosTime: 6275, dosDate: 23586 },
        { name: "Example Gold Visa 7002 - transactions - 2025-12_to_2026-04.csv", size: 227, crc32: 4185429372, sha256: "13d9574b68c34ed409fe4454dc62f9a83ef07611082a88c0c32c7fc7647d0657", dosTime: 6275, dosDate: 23586 },
        { name: "Example Gold Visa 7002 - 2025-12_to_2026-04.qif", size: 276, crc32: 972863242, sha256: "ac239f80a40f70ebb3a2d79785a00069d7015deaaf51cb85a81f6f06ab670967", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum Mastercard 3001 - transactions - 2025-12_to_2026-04.csv", size: 839, crc32: 2276822980, sha256: "f2852b364a0d199ea872c9e41b5d59ed0ea95221c816ed8e38186528481fc0d8", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum Mastercard 3001 - 2025-12_to_2026-04.qif", size: 901, crc32: 111770442, sha256: "d11d5f15b5a28b9ae37ff0e6df1ae005b02cfd601ca9f93b463b4bb6799616e8", dosTime: 6275, dosDate: 23586 },
      ] },
    ] },
    { id: "tradelog/first", mode: "tradelog", from: "2025-12", to: "2025-12", records: [
      { trigger: "card", account: "Example Gold Visa 7002", card: "Example Gold Visa 7002", kind: "transactions", name: "Example Gold Visa 7002 - transactions - 2025-12.csv", type: "text/csv", size: 114, sha256: "6180973c3d8342fe6bb36e4cd0e7b9ea49d0d321b515a4f969306fe85e4a0c8c" },
      { trigger: "card", account: "Example Gold Visa 7002", card: "Example Gold Visa 7002", kind: "qif", name: "Example Gold Visa 7002 - 2025-12.qif", type: "text/csv", size: 161, sha256: "62f264ddb1c61fb65011feeabe360718830af873f807c90d98fa02252c2fe27f" },
      { trigger: "card", account: "Example Platinum Mastercard 3001", card: "Example Platinum Mastercard 3001", kind: "transactions", name: "Example Platinum Mastercard 3001 - transactions - 2025-12.csv", type: "text/csv", size: 297, sha256: "9d87708e0ec840252512cfa43917726345efa9bdca424585538b3be2fbc4df70" },
      { trigger: "card", account: "Example Platinum Mastercard 3001", card: "Example Platinum Mastercard 3001", kind: "qif", name: "Example Platinum Mastercard 3001 - 2025-12.qif", type: "text/csv", size: 351, sha256: "b927ecfcb67f0e16e75d99f6fe72222cd1fa9a1f82fa92b96dc1f3a5b46e61eb" },
      { trigger: "accounts", account: null, card: null, kind: null, name: "Maybank Credit Card accounts - 2025-12.csv", type: "text/csv", size: 170, sha256: "02b3d53231dd0fe1ec79b6d58a4bfcf36eec1aec4e3752cf5663cd0b01dc7362" },
      { trigger: "combined", account: null, card: null, kind: null, name: "Maybank Credit Card all accounts - transactions - 2025-12.csv", type: "text/csv", size: 509, sha256: "6863d21ca34ff3e18a030c5d0428b1f84c88f780be5fc309dcb482e89ef3aedd" },
      { trigger: "zip", account: null, card: null, kind: null, name: "maybank-creditcard-csv-2025-12_to_2025-12.zip", type: "application/zip", size: 1967, sha256: "bd80591a60ee5644d9dd42a82854c8b4c68f3b796f84d9daf8e6f6c6722de273", entries: [
        { name: "Maybank Credit Card accounts - 2025-12.csv", size: 170, crc32: 3728573013, sha256: "02b3d53231dd0fe1ec79b6d58a4bfcf36eec1aec4e3752cf5663cd0b01dc7362", dosTime: 6275, dosDate: 23586 },
        { name: "Example Gold Visa 7002 - transactions - 2025-12.csv", size: 114, crc32: 662546952, sha256: "6180973c3d8342fe6bb36e4cd0e7b9ea49d0d321b515a4f969306fe85e4a0c8c", dosTime: 6275, dosDate: 23586 },
        { name: "Example Gold Visa 7002 - 2025-12.qif", size: 161, crc32: 2815099567, sha256: "62f264ddb1c61fb65011feeabe360718830af873f807c90d98fa02252c2fe27f", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum Mastercard 3001 - transactions - 2025-12.csv", size: 297, crc32: 1783391358, sha256: "9d87708e0ec840252512cfa43917726345efa9bdca424585538b3be2fbc4df70", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum Mastercard 3001 - 2025-12.qif", size: 351, crc32: 1870802730, sha256: "b927ecfcb67f0e16e75d99f6fe72222cd1fa9a1f82fa92b96dc1f3a5b46e61eb", dosTime: 6275, dosDate: 23586 },
      ] },
    ] },
    { id: "tradelog/last", mode: "tradelog", from: "2026-04", to: "2026-04", records: [
      { trigger: "card", account: "Example Platinum Mastercard 3001", card: "Example Platinum Mastercard 3001", kind: "transactions", name: "Example Platinum Mastercard 3001 - transactions - 2026-04.csv", type: "text/csv", size: 78, sha256: "1ea68e2c56df82a6932dacbf753381264564592c0eb78857b052b931c5a5084a" },
      { trigger: "card", account: "Example Platinum Mastercard 3001", card: "Example Platinum Mastercard 3001", kind: "qif", name: "Example Platinum Mastercard 3001 - 2026-04.qif", type: "text/csv", size: 134, sha256: "da00c56ba2894d4a41249827d5d36123ea6dc88f9ba9f6033f4edc655d071eb0" },
      { trigger: "accounts", account: null, card: null, kind: null, name: "Maybank Credit Card accounts - 2026-04.csv", type: "text/csv", size: 114, sha256: "774c473c18a0de547062b9789144429d381d9313429041e37d543423abc17876" },
      { trigger: "combined", account: null, card: null, kind: null, name: "Maybank Credit Card all accounts - transactions - 2026-04.csv", type: "text/csv", size: 119, sha256: "9e457fff16abbf176f2b32c713eca8f98d8d498303a2c3bdd020822284da22d3" },
      { trigger: "zip", account: null, card: null, kind: null, name: "maybank-creditcard-csv-2026-04_to_2026-04.zip", type: "application/zip", size: 874, sha256: "91fc979a0cb8f0292b3286912cfae46ecbaaa51a28c740ba0b88efb8eef53e7c", entries: [
        { name: "Maybank Credit Card accounts - 2026-04.csv", size: 114, crc32: 158395422, sha256: "774c473c18a0de547062b9789144429d381d9313429041e37d543423abc17876", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum Mastercard 3001 - transactions - 2026-04.csv", size: 78, crc32: 4071725788, sha256: "1ea68e2c56df82a6932dacbf753381264564592c0eb78857b052b931c5a5084a", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum Mastercard 3001 - 2026-04.qif", size: 134, crc32: 428386143, sha256: "da00c56ba2894d4a41249827d5d36123ea6dc88f9ba9f6033f4edc655d071eb0", dosTime: 6275, dosDate: 23586 },
      ] },
    ] },
    { id: "holdings/full", mode: "holdings", from: "2025-12", to: "2026-04", records: [
      { trigger: "card", account: "Example Gold Visa 7002", card: "Example Gold Visa 7002", kind: "transactions", name: "Example Gold Visa 7002 - transactions - 2025-12_to_2026-04.csv", type: "text/csv", size: 227, sha256: "13d9574b68c34ed409fe4454dc62f9a83ef07611082a88c0c32c7fc7647d0657" },
      { trigger: "card", account: "Example Gold Visa 7002", card: "Example Gold Visa 7002", kind: "qif", name: "Example Gold Visa 7002 - 2025-12_to_2026-04.qif", type: "text/csv", size: 276, sha256: "ac239f80a40f70ebb3a2d79785a00069d7015deaaf51cb85a81f6f06ab670967" },
      { trigger: "card", account: "Example Platinum Mastercard 3001", card: "Example Platinum Mastercard 3001", kind: "transactions", name: "Example Platinum Mastercard 3001 - transactions - 2025-12_to_2026-04.csv", type: "text/csv", size: 839, sha256: "f2852b364a0d199ea872c9e41b5d59ed0ea95221c816ed8e38186528481fc0d8" },
      { trigger: "card", account: "Example Platinum Mastercard 3001", card: "Example Platinum Mastercard 3001", kind: "qif", name: "Example Platinum Mastercard 3001 - 2025-12_to_2026-04.qif", type: "text/csv", size: 901, sha256: "d11d5f15b5a28b9ae37ff0e6df1ae005b02cfd601ca9f93b463b4bb6799616e8" },
      { trigger: "accounts", account: null, card: null, kind: null, name: "Maybank Credit Card accounts - 2025-12_to_2026-04.csv", type: "text/csv", size: 170, sha256: "02b3d53231dd0fe1ec79b6d58a4bfcf36eec1aec4e3752cf5663cd0b01dc7362" },
      { trigger: "combined", account: null, card: null, kind: null, name: "Maybank Credit Card all accounts - transactions - 2025-12_to_2026-04.csv", type: "text/csv", size: 1507, sha256: "803422a473dec396248bf4874addccb32bd6a13275847770475c30658aaa561d" },
      { trigger: "zip", account: null, card: null, kind: null, name: "maybank-creditcard-csv-2025-12_to_2026-04.zip", type: "application/zip", size: 3397, sha256: "04604eb40e44b87a350e6b6504d38d9710ce6ad9cc03569512c1dd2f35a61d74", entries: [
        { name: "Maybank Credit Card accounts - 2025-12_to_2026-04.csv", size: 170, crc32: 3728573013, sha256: "02b3d53231dd0fe1ec79b6d58a4bfcf36eec1aec4e3752cf5663cd0b01dc7362", dosTime: 6275, dosDate: 23586 },
        { name: "Example Gold Visa 7002 - transactions - 2025-12_to_2026-04.csv", size: 227, crc32: 4185429372, sha256: "13d9574b68c34ed409fe4454dc62f9a83ef07611082a88c0c32c7fc7647d0657", dosTime: 6275, dosDate: 23586 },
        { name: "Example Gold Visa 7002 - 2025-12_to_2026-04.qif", size: 276, crc32: 972863242, sha256: "ac239f80a40f70ebb3a2d79785a00069d7015deaaf51cb85a81f6f06ab670967", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum Mastercard 3001 - transactions - 2025-12_to_2026-04.csv", size: 839, crc32: 2276822980, sha256: "f2852b364a0d199ea872c9e41b5d59ed0ea95221c816ed8e38186528481fc0d8", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum Mastercard 3001 - 2025-12_to_2026-04.qif", size: 901, crc32: 111770442, sha256: "d11d5f15b5a28b9ae37ff0e6df1ae005b02cfd601ca9f93b463b4bb6799616e8", dosTime: 6275, dosDate: 23586 },
      ] },
    ] },
    { id: "holdings/first", mode: "holdings", from: "2025-12", to: "2025-12", records: [
      { trigger: "card", account: "Example Gold Visa 7002", card: "Example Gold Visa 7002", kind: "transactions", name: "Example Gold Visa 7002 - transactions - 2025-12.csv", type: "text/csv", size: 114, sha256: "6180973c3d8342fe6bb36e4cd0e7b9ea49d0d321b515a4f969306fe85e4a0c8c" },
      { trigger: "card", account: "Example Gold Visa 7002", card: "Example Gold Visa 7002", kind: "qif", name: "Example Gold Visa 7002 - 2025-12.qif", type: "text/csv", size: 161, sha256: "62f264ddb1c61fb65011feeabe360718830af873f807c90d98fa02252c2fe27f" },
      { trigger: "card", account: "Example Platinum Mastercard 3001", card: "Example Platinum Mastercard 3001", kind: "transactions", name: "Example Platinum Mastercard 3001 - transactions - 2025-12.csv", type: "text/csv", size: 297, sha256: "9d87708e0ec840252512cfa43917726345efa9bdca424585538b3be2fbc4df70" },
      { trigger: "card", account: "Example Platinum Mastercard 3001", card: "Example Platinum Mastercard 3001", kind: "qif", name: "Example Platinum Mastercard 3001 - 2025-12.qif", type: "text/csv", size: 351, sha256: "b927ecfcb67f0e16e75d99f6fe72222cd1fa9a1f82fa92b96dc1f3a5b46e61eb" },
      { trigger: "accounts", account: null, card: null, kind: null, name: "Maybank Credit Card accounts - 2025-12.csv", type: "text/csv", size: 170, sha256: "02b3d53231dd0fe1ec79b6d58a4bfcf36eec1aec4e3752cf5663cd0b01dc7362" },
      { trigger: "combined", account: null, card: null, kind: null, name: "Maybank Credit Card all accounts - transactions - 2025-12.csv", type: "text/csv", size: 509, sha256: "6863d21ca34ff3e18a030c5d0428b1f84c88f780be5fc309dcb482e89ef3aedd" },
      { trigger: "zip", account: null, card: null, kind: null, name: "maybank-creditcard-csv-2025-12_to_2025-12.zip", type: "application/zip", size: 1967, sha256: "bd80591a60ee5644d9dd42a82854c8b4c68f3b796f84d9daf8e6f6c6722de273", entries: [
        { name: "Maybank Credit Card accounts - 2025-12.csv", size: 170, crc32: 3728573013, sha256: "02b3d53231dd0fe1ec79b6d58a4bfcf36eec1aec4e3752cf5663cd0b01dc7362", dosTime: 6275, dosDate: 23586 },
        { name: "Example Gold Visa 7002 - transactions - 2025-12.csv", size: 114, crc32: 662546952, sha256: "6180973c3d8342fe6bb36e4cd0e7b9ea49d0d321b515a4f969306fe85e4a0c8c", dosTime: 6275, dosDate: 23586 },
        { name: "Example Gold Visa 7002 - 2025-12.qif", size: 161, crc32: 2815099567, sha256: "62f264ddb1c61fb65011feeabe360718830af873f807c90d98fa02252c2fe27f", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum Mastercard 3001 - transactions - 2025-12.csv", size: 297, crc32: 1783391358, sha256: "9d87708e0ec840252512cfa43917726345efa9bdca424585538b3be2fbc4df70", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum Mastercard 3001 - 2025-12.qif", size: 351, crc32: 1870802730, sha256: "b927ecfcb67f0e16e75d99f6fe72222cd1fa9a1f82fa92b96dc1f3a5b46e61eb", dosTime: 6275, dosDate: 23586 },
      ] },
    ] },
    { id: "holdings/last", mode: "holdings", from: "2026-04", to: "2026-04", records: [
      { trigger: "card", account: "Example Platinum Mastercard 3001", card: "Example Platinum Mastercard 3001", kind: "transactions", name: "Example Platinum Mastercard 3001 - transactions - 2026-04.csv", type: "text/csv", size: 78, sha256: "1ea68e2c56df82a6932dacbf753381264564592c0eb78857b052b931c5a5084a" },
      { trigger: "card", account: "Example Platinum Mastercard 3001", card: "Example Platinum Mastercard 3001", kind: "qif", name: "Example Platinum Mastercard 3001 - 2026-04.qif", type: "text/csv", size: 134, sha256: "da00c56ba2894d4a41249827d5d36123ea6dc88f9ba9f6033f4edc655d071eb0" },
      { trigger: "accounts", account: null, card: null, kind: null, name: "Maybank Credit Card accounts - 2026-04.csv", type: "text/csv", size: 114, sha256: "774c473c18a0de547062b9789144429d381d9313429041e37d543423abc17876" },
      { trigger: "combined", account: null, card: null, kind: null, name: "Maybank Credit Card all accounts - transactions - 2026-04.csv", type: "text/csv", size: 119, sha256: "9e457fff16abbf176f2b32c713eca8f98d8d498303a2c3bdd020822284da22d3" },
      { trigger: "zip", account: null, card: null, kind: null, name: "maybank-creditcard-csv-2026-04_to_2026-04.zip", type: "application/zip", size: 874, sha256: "91fc979a0cb8f0292b3286912cfae46ecbaaa51a28c740ba0b88efb8eef53e7c", entries: [
        { name: "Maybank Credit Card accounts - 2026-04.csv", size: 114, crc32: 158395422, sha256: "774c473c18a0de547062b9789144429d381d9313429041e37d543423abc17876", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum Mastercard 3001 - transactions - 2026-04.csv", size: 78, crc32: 4071725788, sha256: "1ea68e2c56df82a6932dacbf753381264564592c0eb78857b052b931c5a5084a", dosTime: 6275, dosDate: 23586 },
        { name: "Example Platinum Mastercard 3001 - 2026-04.qif", size: 134, crc32: 428386143, sha256: "da00c56ba2894d4a41249827d5d36123ea6dc88f9ba9f6033f4edc655d071eb0", dosTime: 6275, dosDate: 23586 },
      ] },
    ] },
  ],
};
