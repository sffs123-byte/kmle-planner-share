#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import unicodedata
from datetime import datetime, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_PDF = Path("/Users/sffs123gmail.com/.openclaw/workspace/총론_산부여성소아.pdf")
DEFAULT_CC_PDF_ROOT = Path("/Users/sffs123gmail.com/.openclaw/workspace/총론_cc")
DEFAULT_TEAM4_ROOT = Path(
    "/Users/sffs123gmail.com/Desktop/의학과 공부 파일/자료/4조 실기 연습/CPX 대본"
)
DEFAULT_TEAM4_PDF_ROOT = DEFAULT_TEAM4_ROOT / "PDF 변환본_2026-06-25"
DEFAULT_CHECKLIST_ROOT = Path(
    "/Users/sffs123gmail.com/Desktop/의학과 공부 파일/자료/한끝/체크리스트_CC별_분할_20260708"
)
SYSTEM_PDFS = {
    "digestive": Path("/Users/sffs123gmail.com/.openclaw/workspace/총론_소화기.pdf"),
    "circulation": Path("/Users/sffs123gmail.com/.openclaw/workspace/총론_순환기.pdf"),
    "respiratory": Path("/Users/sffs123gmail.com/.openclaw/workspace/총론_호흡기.pdf"),
    "kidney_urinary": Path("/Users/sffs123gmail.com/.openclaw/workspace/총론_신장비뇨.pdf"),
    "general": Path("/Users/sffs123gmail.com/.openclaw/workspace/총론_전신.pdf"),
    "msk_skin": Path("/Users/sffs123gmail.com/.openclaw/workspace/총론_관절근골피부.pdf"),
    "neuropsych": Path("/Users/sffs123gmail.com/.openclaw/workspace/총론_정신신경.pdf"),
    "obgyn_peds": Path("/Users/sffs123gmail.com/.openclaw/workspace/총론_산부여성소아.pdf"),
    "counseling": Path("/Users/sffs123gmail.com/.openclaw/workspace/총론_상담.pdf"),
}

HANKEUT_EXCERPT_OVERRIDES = {
    "1": {"sourcePdf": "digestive", "pdfPages": [4, 12], "bookPages": [74, 82]},
    "2": {"sourcePdf": "digestive", "pdfPages": [13, 20], "bookPages": [83, 90]},
    "3": {"sourcePdf": "digestive", "pdfPages": [21, 26], "bookPages": [91, 96]},
    "4": {"sourcePdf": "digestive", "pdfPages": [27, 33], "bookPages": [97, 103]},
    "5": {"sourcePdf": "digestive", "pdfPages": [34, 39], "bookPages": [104, 109]},
    "6": {"sourcePdf": "digestive", "pdfPages": [40, 51], "bookPages": [110, 121]},
    "6-2": {"sourcePdf": "digestive", "pdfPages": [40, 51], "bookPages": [110, 121]},
    "7": {"sourcePdf": "digestive", "pdfPages": [52, 58], "bookPages": [122, 128]},
    "8": {"sourcePdf": "circulation", "pdfPages": [2, 8], "bookPages": [130, 136]},
    "9": {"sourcePdf": "circulation", "pdfPages": [9, 15], "bookPages": [137, 143]},
    "10": {"sourcePdf": "circulation", "pdfPages": [16, 22], "bookPages": [144, 150]},
    "11": {"sourcePdf": "circulation", "pdfPages": [23, 28], "bookPages": [151, 156]},
    "12": {"sourcePdf": "circulation", "pdfPages": [29, 34], "bookPages": [157, 162]},
    "13": {"sourcePdf": "respiratory", "pdfPages": [2, 8], "bookPages": [164, 170]},
    "14": {"sourcePdf": "respiratory", "pdfPages": [9, 15], "bookPages": [171, 177]},
    "15": {"sourcePdf": "respiratory", "pdfPages": [16, 22], "bookPages": [178, 184]},
    "16": {"sourcePdf": "respiratory", "pdfPages": [23, 30], "bookPages": [185, 192]},
    "17": {"sourcePdf": "kidney_urinary", "pdfPages": [2, 11], "bookPages": [194, 203]},
    "17-2": {"sourcePdf": "kidney_urinary", "pdfPages": [2, 11], "bookPages": [194, 203]},
    "18": {"sourcePdf": "kidney_urinary", "pdfPages": [12, 19], "bookPages": [204, 211]},
    "19": {"sourcePdf": "kidney_urinary", "pdfPages": [20, 28], "bookPages": [212, 220]},
    "19-2": {"sourcePdf": "kidney_urinary", "pdfPages": [20, 28], "bookPages": [212, 220]},
    "20": {"sourcePdf": "general", "pdfPages": [3, 9], "bookPages": [223, 229]},
    "21": {"sourcePdf": "general", "pdfPages": [10, 16], "bookPages": [230, 236]},
    "22": {"sourcePdf": "general", "pdfPages": [17, 24], "bookPages": [237, 244]},
    "23": {"sourcePdf": "general", "pdfPages": [25, 31], "bookPages": [245, 251]},
    "24": {"sourcePdf": "general", "pdfPages": [32, 38], "bookPages": [252, 258]},
    "25": {"sourcePdf": "msk_skin", "pdfPages": [2, 12], "bookPages": [260, 270]},
    "26": {"sourcePdf": "msk_skin", "pdfPages": [13, 24], "bookPages": [271, 282]},
    "27": {"sourcePdf": "msk_skin", "pdfPages": [25, 32], "bookPages": [283, 290]},
    "28": {"sourcePdf": "neuropsych", "pdfPages": [2, 8], "bookPages": [292, 298]},
    "29": {"sourcePdf": "neuropsych", "pdfPages": [9, 15], "bookPages": [299, 305]},
    "30": {"sourcePdf": "neuropsych", "pdfPages": [16, 24], "bookPages": [306, 314]},
    "31": {"sourcePdf": "neuropsych", "pdfPages": [25, 34], "bookPages": [315, 324]},
    "32": {"sourcePdf": "neuropsych", "pdfPages": [35, 42], "bookPages": [325, 332]},
    "33": {"sourcePdf": "neuropsych", "pdfPages": [43, 50], "bookPages": [333, 340]},
    "34": {"sourcePdf": "neuropsych", "pdfPages": [51, 57], "bookPages": [341, 347]},
    "35": {"sourcePdf": "neuropsych", "pdfPages": [58, 67], "bookPages": [348, 357]},
    "36": {"sourcePdf": "neuropsych", "pdfPages": [68, 76], "bookPages": [358, 366]},
    "37": {"sourcePdf": "neuropsych", "pdfPages": [77, 85], "bookPages": [367, 375]},
    "38": {"sourcePdf": "obgyn_peds", "pdfPages": [2, 11], "bookPages": [378, 387]},
    "39-1": {"sourcePdf": "obgyn_peds", "pdfPages": [12, 23], "bookPages": [388, 399]},
    "39-2": {"sourcePdf": "obgyn_peds", "pdfPages": [12, 23], "bookPages": [388, 399]},
    "40": {"sourcePdf": "obgyn_peds", "pdfPages": [24, 33], "bookPages": [400, 409]},
    "41": {"sourcePdf": "obgyn_peds", "pdfPages": [34, 42], "bookPages": [410, 418]},
    "42": {"sourcePdf": "obgyn_peds", "pdfPages": [43, 56], "bookPages": [419, 432]},
    "43": {"sourcePdf": "obgyn_peds", "pdfPages": [57, 64], "bookPages": [433, 440]},
    "44": {"sourcePdf": "counseling", "pdfPages": [2, 9], "bookPages": [442, 449]},
    "45": {"sourcePdf": "counseling", "pdfPages": [10, 16], "bookPages": [450, 456]},
    "46": {"sourcePdf": "counseling", "pdfPages": [17, 24], "bookPages": [457, 464]},
    "47": {"sourcePdf": "counseling", "pdfPages": [25, 31], "bookPages": [465, 471]},
    "48": {"sourcePdf": "counseling", "pdfPages": [32, 38], "bookPages": [472, 478]},
}


def team4(key: str, label: str, path: str, tokens: list[str] | None = None) -> dict:
    return {
        "key": key,
        "label": label,
        "path": path,
        "tokens": tokens or [label.replace("4조", "").strip()],
    }


CHECKLIST_CC_BY_DOC = {
    "1": ["01"],
    "2": ["02"],
    "3": ["03"],
    "4": ["04"],
    "5": ["05"],
    "6": ["06-1"],
    "6-2": ["06-2"],
    "7": ["07"],
    "8": ["08"],
    "9": ["09"],
    "10": ["10"],
    "11": ["11"],
    "12": ["12"],
    "13": ["13"],
    "14": ["14"],
    "15": ["15"],
    "16": ["16"],
    "17": ["17-1"],
    "17-2": ["17-2"],
    "18": ["18"],
    "19": ["19"],
    "19-2": ["19"],
    "20": ["20"],
    "21": ["21"],
    "22": ["22"],
    "23": ["23"],
    "24": ["24"],
    "25": ["25"],
    "26": ["26-1", "26-2"],
    "27": ["27"],
    "28": ["28"],
    "29": ["29"],
    "30": ["30"],
    "31": ["31"],
    "32": ["32"],
    "33": ["33"],
    "34": ["34"],
    "35": ["35"],
    "36": ["36"],
    "37": ["37"],
    "38": ["38"],
    "39-1": ["39-1"],
    "39-2": ["39-2"],
    "40-1": ["40-1"],
    "40-2": ["40-2"],
    "41": ["41"],
    "42": ["42"],
    "43": ["43"],
    "44": ["44-1", "44-2"],
    "45": ["45"],
    "46": ["46"],
    "47": ["47-1", "47-2"],
    "48": ["48"],
}


REFERENCE_ITEMS = [
    {
        "docId": "1",
        "title": "01. 급성 복통",
        "hankeutTitle": "급성 복통",
        "ccPdf": "cc01.pdf",
        "team4": [team4("acute_abdominal_pain", "4조 급성복통", "21. 급성복통_4조.docx", ["급성복통", "4조"])],
    },
    {
        "docId": "2",
        "title": "02. 소화불량 만성 복통",
        "hankeutTitle": "소화불량/만성복통",
        "ccPdf": "cc02.pdf",
        "team4": [team4("dyspepsia_chronic_abdominal_pain", "4조 소화불량/만성복통", "27. 소화불량만성복통_4조.docx", ["소화불량", "만성복통"])],
    },
    {
        "docId": "3",
        "title": "03. 토혈",
        "hankeutTitle": "토혈",
        "ccPdf": "cc03.pdf",
        "team4": [team4("hematemesis", "4조 토혈", "43. 토혈_4조.docx", ["토혈", "4조"])],
    },
    {
        "docId": "4",
        "title": "04. 혈변",
        "hankeutTitle": "혈변",
        "ccPdf": "cc04.pdf",
        "team4": [team4("hematochezia", "4조 혈변", "참고 대본/1.소화기/4.혈변.docx", ["혈변"])],
    },
    {
        "docId": "5",
        "title": "05. 구토",
        "hankeutTitle": "구토",
        "ccPdf": "cc05.pdf",
        "team4": [team4("vomiting", "4조 구토", "7. 구토_4조.docx", ["구토", "4조"])],
    },
    {
        "docId": "6",
        "title": "06-1. 배변 이상(변비)",
        "hankeutTitle": "배변 이상(변비)",
        "ccPdf": "cc06.pdf",
        "team4": [team4("constipation", "4조 배변이상(변비)", "20-1. 배변이상(변비)_4조.docx", ["배변이상", "변비", "4조"])],
    },
    {
        "docId": "6-2",
        "title": "06-2. 배변 이상(설사)",
        "hankeutTitle": "배변 이상(설사)",
        "ccPdf": "cc06.pdf",
        "team4": [team4("diarrhea", "4조 배변이상(설사)", "20-2. 배변이상(설사)_4조.docx", ["배변이상", "설사", "4조"])],
    },
    {
        "docId": "7",
        "title": "07. 황달",
        "hankeutTitle": "황달",
        "ccPdf": "cc07.pdf",
        "team4": [team4("jaundice", "4조 황달", "7. 황달_4조.docx", ["황달", "4조"])],
    },
    {
        "docId": "8",
        "title": "08. 가슴 통증",
        "hankeutTitle": "가슴 통증",
        "ccPdf": "cc08.pdf",
        "team4": [team4("chest_pain", "4조 가슴통증", "1. 가슴통증_4조.docx", ["가슴통증", "4조"])],
    },
    {
        "docId": "9",
        "title": "09. 실신",
        "hankeutTitle": "실신",
        "ccPdf": "cc09.pdf",
        "team4": [team4("syncope", "4조 실신", "30. 실신_4조.docx", ["실신", "4조"])],
    },
    {
        "docId": "10",
        "title": "10. 두근거림",
        "hankeutTitle": "두근거림",
        "ccPdf": "cc10.pdf",
        "team4": [team4("palpitation", "4조 두근거림", "13. 두근거림_4조.docx", ["두근거림", "4조"])],
    },
    {
        "docId": "11",
        "title": "11. 고혈압",
        "hankeutTitle": "고혈압",
        "sourcePdf": "circulation",
        "pdfPages": [23, 28],
        "team4": [team4("hypertension", "4조 고혈압", "5. 고혈압_4조.docx", ["고혈압", "4조"])],
    },
    {
        "docId": "12",
        "title": "12. 이상지질혈증",
        "hankeutTitle": "이상지질혈증",
        "sourcePdf": "circulation",
        "pdfPages": [29, 34],
        "team4": [team4("dyslipidemia", "4조 이상지질혈증", "37. 이상지질혈증_4조.docx", ["이상지질혈증", "4조"])],
    },
    {
        "docId": "13",
        "title": "13. 기침",
        "hankeutTitle": "기침",
        "ccPdf": "cc13.pdf",
        "team4": [team4("cough", "4조 기침", "11. 기침_4조.docx", ["기침", "4조"])],
    },
    {
        "docId": "14",
        "title": "14. 콧물 코막힘",
        "hankeutTitle": "콧물/코막힘",
        "ccPdf": "cc14.pdf",
        "team4": [team4("rhinorrhea_nasal_obstruction", "4조 콧물/코막힘", "42. 콧물, 코막힘_4조.docx", ["콧물", "코막힘"])],
    },
    {
        "docId": "15",
        "title": "15. 객혈",
        "hankeutTitle": "객혈",
        "ccPdf": "cc15.pdf",
        "team4": [team4("hemoptysis", "4조 객혈", "3. 객혈_4조.docx", ["객혈", "4조"])],
    },
    {
        "docId": "16",
        "title": "16. 호흡곤란",
        "hankeutTitle": "호흡곤란",
        "ccPdf": "cc16.pdf",
        "team4": [],
    },
    {
        "docId": "17",
        "title": "17-1. 소변량 변화 - 다뇨증",
        "hankeutTitle": "소변량 변화 - 다뇨증",
        "ccPdf": "cc17.pdf",
        "team4": [team4("urine_volume_change", "4조 소변량변화", "26. 소변량변화_4조.docx", ["소변량변화", "4조"])],
    },
    {
        "docId": "17-2",
        "title": "17-2. 소변량 변화 - 핍뇨",
        "hankeutTitle": "소변량 변화 - 핍뇨",
        "ccPdf": "cc17.pdf",
        "team4": [team4("urine_volume_change", "4조 소변량변화", "26. 소변량변화_4조.docx", ["소변량변화", "4조"])],
    },
    {
        "docId": "18",
        "title": "18. 붉은색 소변",
        "hankeutTitle": "붉은색 소변",
        "ccPdf": "cc18.pdf",
        "team4": [team4("red_urine", "4조 붉은색 소변", "23. 붉은색 소변_4조.docx", ["붉은색", "소변", "4조"])],
    },
    {
        "docId": "19",
        "title": "19-1. 배뇨 이상/소변찔끔증 - 배뇨 이상",
        "hankeutTitle": "배뇨 이상/소변찔끔증 - 배뇨 이상",
        "ccPdf": "cc19.pdf",
        "team4": [team4("voiding_dysfunction_incontinence", "4조 배뇨이상/소변찔끔증", "19. 배뇨이상, 소변찔끔증_4조.docx", ["배뇨이상", "소변찔끔증"])],
    },
    {
        "docId": "19-2",
        "title": "19-2. 배뇨 이상/소변찔끔증 - 소변찔끔증",
        "hankeutTitle": "배뇨 이상/소변찔끔증 - 소변찔끔증",
        "ccPdf": "cc19.pdf",
        "team4": [team4("voiding_dysfunction_incontinence", "4조 배뇨이상/소변찔끔증", "19. 배뇨이상, 소변찔끔증_4조.docx", ["배뇨이상", "소변찔끔증"])],
    },
    {
        "docId": "20",
        "title": "20. 발열",
        "hankeutTitle": "발열",
        "ccPdf": "cc20.pdf",
        "team4": [team4("fever", "4조 발열", "18. 발열_4조.docx", ["발열", "4조"])],
    },
    {
        "docId": "21",
        "title": "21. 쉽게 멍이 듦",
        "hankeutTitle": "쉽게 멍이 듦",
        "ccPdf": "cc21.pdf",
        "team4": [team4("easy_bruising", "4조 쉽게 멍이 듦", "29. 쉽게 멍이 듦_4조.docx", ["쉽게", "멍", "4조"])],
    },
    {
        "docId": "22",
        "title": "22. 피로",
        "hankeutTitle": "피로",
        "ccPdf": "cc22.pdf",
        "team4": [team4("fatigue", "4조 피로", "44. 피로_4조.docx", ["피로", "4조"])],
    },
    {
        "docId": "23",
        "title": "23. 체중 감소",
        "hankeutTitle": "체중 감소",
        "ccPdf": "cc23.pdf",
        "team4": [team4("weight_loss", "4조 체중감소", "40. 체중감소_4조.docx", ["체중감소", "4조"])],
    },
    {
        "docId": "24",
        "title": "24. 체중 증가 비만",
        "hankeutTitle": "체중 증가/비만",
        "ccPdf": "cc24.pdf",
        "team4": [team4("weight_gain_obesity", "4조 체중증가/비만", "41. 체중증가,비만_4조.docx", ["체중증가", "비만"])],
    },
    {
        "docId": "25",
        "title": "25. 관절 통증 부기",
        "hankeutTitle": "관절 통증/부기",
        "ccPdf": "cc25.pdf",
        "team4": [team4("joint_pain_swelling", "4조 관절통증", "6. 관절통증.docx", ["관절통증"])],
    },
    {
        "docId": "26",
        "title": "26. 목 허리 통증",
        "hankeutTitle": "목/허리 통증",
        "ccPdf": "cc26.pdf",
        "team4": [team4("neck_back_pain", "4조 목통증/허리통증", "16. 목통증,허리통증_4조.docx", ["목통증", "허리통증"])],
    },
    {
        "docId": "27",
        "title": "27. 피부 발진",
        "hankeutTitle": "피부 발진",
        "ccPdf": "cc27.pdf",
        "team4": [team4("skin_rash", "4조 피부 발진", "45. 피부 발진_4조.docx", ["피부", "발진", "4조"])],
    },
    {
        "docId": "28",
        "title": "28. 기분 저하 우울",
        "hankeutTitle": "기분 저하/우울",
        "ccPdf": "cc28.pdf",
        "team4": [team4("depressed_mood", "4조 기분 변화", "9. 기분 변화_4조.docx", ["기분", "변화", "4조"])],
    },
    {
        "docId": "29",
        "title": "29. 불안",
        "hankeutTitle": "불안",
        "ccPdf": "cc29.pdf",
        "team4": [team4("anxiety", "4조 불안", "22. 불안_4조.docx", ["불안", "4조"])],
    },
    {
        "docId": "30",
        "title": "30. 수면 장애",
        "hankeutTitle": "수면 장애",
        "ccPdf": "cc30.pdf",
        "team4": [team4("sleep_disorder", "4조 수면장애", "28. 수면장애_4조.docx", ["수면장애", "4조"])],
    },
    {
        "docId": "31",
        "title": "31. 기억력 저하 치매",
        "hankeutTitle": "기억력 저하/치매",
        "ccPdf": "cc31.pdf",
        "team4": [team4("memory_loss", "4조 기억력저하", "10. 기억력저하_4조.docx", ["기억력저하", "4조"])],
    },
    {
        "docId": "32",
        "title": "32. 어지럼증",
        "hankeutTitle": "어지럼증",
        "ccPdf": "cc32.pdf",
        "team4": [team4("dizziness", "4조 어지럼", "31. 어지럼_4조.docx", ["어지럼", "4조"])],
    },
    {
        "docId": "33",
        "title": "33. 두통",
        "hankeutTitle": "두통",
        "ccPdf": "cc33.pdf",
        "team4": [team4("headache", "4조 두통", "14. 두통_4조.docx", ["두통", "4조"])],
    },
    {
        "docId": "34",
        "title": "34. 경련",
        "hankeutTitle": "경련",
        "ccPdf": "cc34.pdf",
        "team4": [team4("seizure", "4조 경련", "4. 경련_4조.docx", ["경련", "4조"])],
    },
    {
        "docId": "35",
        "title": "35. 사지 무력 저림",
        "hankeutTitle": "사지 무력/저림",
        "ccPdf": "cc35.pdf",
        "team4": [team4("weakness_sensory_change", "4조 근력/감각이상", "8. 근력_감각이상_4조.docx", ["근력", "감각이상"])],
    },
    {
        "docId": "36",
        "title": "36. 의식 변화",
        "hankeutTitle": "의식 변화",
        "ccPdf": "cc36.pdf",
        "team4": [team4("altered_mental_status", "4조 의식장애", "36. 의식장애_4조.docx", ["의식장애", "4조"])],
    },
    {
        "docId": "37",
        "title": "37. 떨림",
        "hankeutTitle": "떨림/운동이상",
        "ccPdf": "cc37.pdf",
        "team4": [team4("tremor_movement_disorder", "4조 떨림/운동이상", "15. 떨림,운동이상.docx", ["떨림", "운동이상"])],
    },
    {
        "docId": "38",
        "title": "38. 유방 통증 멍울",
        "hankeutTitle": "유방통/유방덩이",
        "ccPdf": "cc38.pdf",
        "team4": [
            team4("breast_pain_mass", "4조 유방통/유방덩이", "34. 유방통,유방덩이_4조.docx", ["유방통", "유방덩이", "4조"])
        ],
    },
    {
        "docId": "39-1",
        "title": "39-1. 질 분비물",
        "hankeutTitle": "질분비물/질출혈",
        "ccPdf": "cc39.pdf",
        "team4": [
            team4("vaginal_discharge_bleeding", "4조 질분비물/질출혈", "39. 질분비물_질출혈.docx", ["질분비물", "질출혈"])
        ],
    },
    {
        "docId": "39-2",
        "title": "39-2. 질 출혈",
        "hankeutTitle": "질분비물/질출혈",
        "ccPdf": "cc39.pdf",
        "team4": [
            team4("vaginal_discharge_bleeding", "4조 질분비물/질출혈", "39. 질분비물_질출혈.docx", ["질분비물", "질출혈"])
        ],
    },
    {
        "docId": "40-1",
        "title": "40-1. 월경 이상",
        "hankeutTitle": "월경 이상/월경통",
        "sourcePdf": "obgyn_peds",
        "pdfPages": [24, 33],
        "bookPages": [400, 409],
        "team4": [
            team4("amenorrhea", "4조 무월경/월경이상", "33-1. 월경이상(무월경)_4조.docx", ["월경이상", "무월경", "4조"]),
        ],
    },
    {
        "docId": "40-2",
        "title": "40-2. 월경통",
        "hankeutTitle": "월경 이상/월경통",
        "sourcePdf": "obgyn_peds",
        "pdfPages": [24, 33],
        "bookPages": [400, 409],
        "team4": [
            team4("dysmenorrhea", "4조 월경통", "33-2. 월경통_4조.docx", ["월경통", "4조"]),
        ],
    },
    {
        "docId": "41",
        "title": "41. 산전 진찰",
        "hankeutTitle": "산전 진찰",
        "ccPdf": "cc41.pdf",
        "team4": [
            team4("prenatal_care", "4조 산전진찰", "24. 산전진찰_4조.docx", ["산전진찰", "4조"])
        ],
    },
    {
        "docId": "42",
        "title": "42. 성장 발달",
        "hankeutTitle": "성장/발달지연",
        "ccPdf": "cc42.pdf",
        "team4": [
            team4("growth_development_delay", "4조 성장/발달지연", "25. 성장,발달지연_4조.docx", ["성장", "발달지연", "4조"])
        ],
    },
    {
        "docId": "43",
        "title": "43. 예방접종",
        "hankeutTitle": "예방접종",
        "ccPdf": "cc43.pdf",
        "team4": [
            team4("immunization", "4조 예방접종", "32. 예방접종_4조.docx", ["예방접종", "4조"])
        ],
    },
    {
        "docId": "44",
        "title": "44. 음주 금연 상담",
        "hankeutTitle": "음주/금연 상담",
        "ccPdf": "cc44.pdf",
        "team4": [
            team4("alcohol_smoking_counseling", "4조 음주/금연 상담", "35. 음주 상담, 금연 상담_4조.docx", ["음주", "금연", "상담"])
        ],
    },
    {
        "docId": "45",
        "title": "45. 약물 오남용",
        "hankeutTitle": "약물 오남용",
        "ccPdf": "cc45.pdf",
        "team4": [
            team4("substance_abuse", "4조 물질오남용", "17. 물질오남용_4조.docx", ["물질오남용", "4조"])
        ],
    },
    {
        "docId": "46",
        "title": "46. 나쁜 소식 전달",
        "hankeutTitle": "나쁜 소식 전달",
        "ccPdf": "cc46.pdf",
        "team4": [
            team4("breaking_bad_news", "4조 나쁜 소식 전하기", "12. 나쁜 소식 전하기_4조.docx", ["나쁜", "소식", "전하기"])
        ],
    },
    {
        "docId": "47",
        "title": "47. 가정폭력 성폭력",
        "hankeutTitle": "가정폭력/성폭력",
        "ccPdf": "cc47.pdf",
        "team4": [
            team4("domestic_violence", "4조 가정폭력", "2-1. 가정폭력_4조.docx", ["가정폭력", "4조"]),
            team4("sexual_violence", "4조 성폭력", "2-2. 성폭력_4조.docx", ["성폭력", "4조"]),
        ],
    },
    {
        "docId": "48",
        "title": "48. 자살 사고 시도",
        "hankeutTitle": "자살 사고/시도",
        "ccPdf": "cc48.pdf",
        "team4": [
            team4("suicide", "4조 자살", "38. 자살_4조.docx", ["자살", "4조"])
        ],
    },
]


def normalize(value: str) -> str:
    return unicodedata.normalize("NFC", value).replace(" ", "").replace("_", "").lower()


def rel(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def clean_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def image_size(path: Path) -> dict[str, int] | None:
    try:
        result = run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(path)])
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
    width = height = None
    for line in result.stdout.splitlines():
        if "pixelWidth:" in line:
            width = int(line.rsplit(":", 1)[1].strip())
        elif "pixelHeight:" in line:
            height = int(line.rsplit(":", 1)[1].strip())
    if width and height:
        return {"width": width, "height": height}
    return None


def pdf_page_count(path: Path) -> int | None:
    try:
        result = run(["pdfinfo", str(path)])
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
    for line in result.stdout.splitlines():
        if line.startswith("Pages:"):
            try:
                return int(line.split(":", 1)[1].strip())
            except ValueError:
                return None
    return None


def render_pdf_page_images(
    pdf_path: Path,
    pages_dir: Path,
    *,
    dpi: int,
    quality: int,
    pdf_page_start: int | None = None,
    book_page_start: int | None = None,
) -> list[dict]:
    clean_dir(pages_dir)
    prefix = pages_dir / "page"
    run(
        [
            "pdftoppm",
            "-jpeg",
            "-jpegopt",
            f"quality={quality}",
            "-r",
            str(dpi),
            str(pdf_path),
            str(prefix),
        ]
    )
    images = sorted(pages_dir.glob("page-*.jpg"), key=lambda p: int(p.stem.rsplit("-", 1)[1]))
    pages: list[dict] = []
    for index, src in enumerate(images, start=1):
        dst = pages_dir / f"page-{index:03d}.jpg"
        if src != dst:
            src.replace(dst)
        size = image_size(dst) or {}
        entry = {
            "index": index,
            "image": rel(dst),
            "pdfPage": (pdf_page_start + index - 1) if pdf_page_start else index,
            "width": size.get("width"),
            "height": size.get("height"),
        }
        if book_page_start:
            entry["bookPage"] = book_page_start + index - 1
        pages.append({k: v for k, v in entry.items() if v is not None})
    return pages


def resolve_hankeut_source_pdf(default_source_pdf: Path, cc_pdf_root: Path, item: dict) -> Path:
    source_pdf = item.get("sourcePdf")
    if source_pdf:
        return SYSTEM_PDFS.get(source_pdf, Path(source_pdf))
    if item.get("ccPdf"):
        return cc_pdf_root / item["ccPdf"]
    return default_source_pdf


def render_hankeut_pdf_excerpt(source_pdf: Path, cc_pdf_root: Path, item: dict, output_root: Path, *, dpi: int, quality: int) -> dict:
    item = {**item, **HANKEUT_EXCERPT_OVERRIDES.get(str(item["docId"]), {})}
    doc_id = item["docId"]
    out_dir = output_root / "hankeut" / doc_id
    clean_dir(out_dir)
    source = resolve_hankeut_source_pdf(source_pdf, cc_pdf_root, item)
    if not source.exists():
        raise FileNotFoundError(source)
    pdf_path = out_dir / "excerpt.pdf"
    page_range = None
    if item.get("pdfPages"):
        start, end = item["pdfPages"]
        scratch = out_dir / "_pages"
        clean_dir(scratch)
        pattern = scratch / "page-%03d.pdf"
        run(["pdfseparate", "-f", str(start), "-l", str(end), str(source), str(pattern)])
        parts = []
        for pdf_page in range(start, end + 1):
            part = scratch / f"page-{pdf_page:03d}.pdf"
            if not part.exists():
                raise FileNotFoundError(f"Split PDF page missing: {part}")
            parts.append(part)
        run(["pdfunite", *(str(part) for part in parts), str(pdf_path)])
        shutil.rmtree(scratch)
        page_range = f"{start}-{end}"
    else:
        shutil.copy2(source, pdf_path)
        if item.get("ccPdf"):
            page_range = item["ccPdf"].removesuffix(".pdf").upper()

    page_count = pdf_page_count(pdf_path)
    pdf_page_start = item.get("pdfPages", [None])[0] if item.get("pdfPages") else None
    book_page_start = item.get("bookPages", [None])[0] if item.get("bookPages") else None
    pages = render_pdf_page_images(
        pdf_path,
        out_dir / "pages",
        dpi=dpi,
        quality=quality,
        pdf_page_start=pdf_page_start,
        book_page_start=book_page_start,
    )

    result = {
        "title": item["hankeutTitle"],
        "source": str(source),
        "sourceFileTitle": source.name,
        "renderMode": "image-excerpt",
        "pdfPageRange": page_range,
        "pdf": rel(pdf_path),
        "pages": pages,
        "pageCount": page_count,
    }
    if item.get("bookPages"):
        result["bookPageRange"] = f"{item['bookPages'][0]}-{item['bookPages'][1]}"
    return result


def find_team4_docx(team4_root: Path, spec: dict) -> Path | None:
    if spec.get("path"):
        candidate = team4_root / spec["path"]
        if candidate.exists():
            return candidate
    wanted = [normalize(token) for token in spec["tokens"]]
    candidates = sorted(team4_root.rglob("*.docx"))
    for path in candidates:
        name = normalize(path.name)
        if all(token in name for token in wanted):
            return path
    return None


def find_team4_pdf(team4_pdf_root: Path, spec: dict) -> Path | None:
    if not team4_pdf_root.exists():
        return None
    if spec.get("path"):
        expected_name = Path(spec["path"]).with_suffix(".pdf").name
        wanted_name = normalize(expected_name)
        for candidate in sorted(team4_pdf_root.glob("*.pdf")):
            if normalize(candidate.name) == wanted_name:
                return candidate
    wanted = [normalize(token) for token in spec["tokens"]]
    for path in sorted(team4_pdf_root.glob("*.pdf")):
        name = normalize(path.name)
        if all(token in name for token in wanted):
            return path
    return None


def render_team4_pdf(source_pdf: Path, output_dir: Path, *, dpi: int, quality: int) -> tuple[Path, list[dict]]:
    clean_dir(output_dir)
    pdf = output_dir / "source.pdf"
    shutil.copy2(source_pdf, pdf)
    pages = render_pdf_page_images(pdf, output_dir / "pages", dpi=dpi, quality=quality)
    return pdf, pages


def render_quicklook_html(source_docx: Path, output_dir: Path) -> Path:
    clean_dir(output_dir)
    scratch = output_dir / "_ql"
    clean_dir(scratch)
    run(["qlmanage", "-o", str(scratch), "-p", str(source_docx)])
    previews = sorted(scratch.glob("*.qlpreview"))
    if not previews:
        raise RuntimeError(f"Quick Look preview was not created for {source_docx}")
    preview_dir = previews[0]
    for child in preview_dir.iterdir():
        if child.name == "PreviewProperties.plist":
            continue
        shutil.copy2(child, output_dir / child.name)
    shutil.rmtree(scratch)
    html = output_dir / "Preview.html"
    if not html.exists():
        raise RuntimeError(f"Quick Look preview HTML missing for {source_docx}")
    inject_quicklook_fit(html)
    return html


def inject_quicklook_fit(html: Path) -> None:
    text = html.read_text(encoding="utf-8")
    readable = """<style id="cpx-ql-readable-text">html{background:#fff}</style><script id="cpx-ql-readable-script">(()=>{function rgb(v){const m=String(v||'').match(/rgba?\\(([^)]+)\\)/i);if(!m)return null;const p=m[1].split(',').map(x=>Number(String(x).trim()));return{r:p[0]||0,g:p[1]||0,b:p[2]||0,a:p.length>3?p[3]:1}}function lum(c){return(c.r*299+c.g*587+c.b*114)/255000}function bg(el){for(let n=el;n;n=n.parentElement){const c=rgb(getComputedStyle(n).backgroundColor);if(c&&c.a>.15)return c}return{r:255,g:255,b:255,a:1}}function fix(){document.querySelectorAll('body *').forEach(el=>{const cs=getComputedStyle(el),fg=rgb(cs.color),b=bg(el);if(!fg)return;if((fg.a<.68||lum(fg)>.72)&&lum(b)>.74){el.style.color='#243044';el.style.webkitTextFillColor='#243044'}})}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fix,{once:true});else fix();setTimeout(fix,250)})();</script>"""
    if "cpx-ql-fit" in text and "cpx-ql-readable-text" in text:
        return
    fit = """<style id="cpx-ql-fit">html{background:#fff}body{margin:0!important;overflow-x:auto;transform-origin:0 0}.cpx-ql-fit-note{display:none}</style><script id="cpx-ql-fit-script">(()=>{function fit(){const meta=document.querySelector('meta[name="viewport"]')?.content||'';const m=meta.match(/width\\s*=\\s*(\\d+)/i);const base=m?Number(m[1]):Math.max(900,document.body?.scrollWidth||1224);const scale=Math.min(1,Math.max(.42,(window.innerWidth-8)/base));if(document.body){document.body.style.zoom=String(scale);document.body.classList.add('cpx-ql-fitted')}}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fit,{once:true});else fit();window.addEventListener('resize',fit,{passive:true})})();</script>"""
    if "</head>" not in text:
        raise RuntimeError(f"Preview HTML has no head close tag: {html}")
    insert = ""
    if "cpx-ql-fit" not in text:
        insert += fit
    if "cpx-ql-readable-text" not in text:
        insert += readable
    html.write_text(text.replace("</head>", insert + "</head>", 1), encoding="utf-8")


def render_team4_sources(
    team4_root: Path,
    team4_pdf_root: Path,
    item: dict,
    output_root: Path,
    *,
    dpi: int,
    quality: int,
) -> list[dict]:
    rendered = []
    for spec in item["team4"]:
        out_dir = output_root / "team4" / item["docId"] / spec["key"]
        source_pdf = find_team4_pdf(team4_pdf_root, spec)
        if source_pdf:
            pdf, pages = render_team4_pdf(source_pdf, out_dir, dpi=dpi, quality=quality)
            rendered.append(
                {
                    "key": spec["key"],
                    "label": spec["label"],
                    "source": str(source_pdf),
                    "sourceFileTitle": unicodedata.normalize("NFC", source_pdf.name),
                    "renderMode": "image-source",
                    "pdf": rel(pdf),
                    "pages": pages,
                    "pageCount": pdf_page_count(pdf),
                }
            )
            continue
        source_docx = find_team4_docx(team4_root, spec)
        if not source_docx:
            rendered.append(
                {
                    "key": spec["key"],
                    "label": spec["label"],
                    "missing": True,
                    "tokens": spec["tokens"],
                }
            )
            continue
        html = render_quicklook_html(source_docx, out_dir)
        rendered.append(
            {
                "key": spec["key"],
                "label": spec["label"],
                "source": str(source_docx),
                "sourceFileTitle": source_docx.name,
                "renderMode": "quicklook-html",
                "html": rel(html),
            }
        )
    return rendered


def find_checklist_pdf(checklist_root: Path, cc: str) -> Path:
    matches = sorted(checklist_root.glob(f"*_{cc}_*.pdf"))
    if not matches:
        raise FileNotFoundError(f"Checklist PDF for {cc} not found under {checklist_root}")
    return matches[0]


def render_checklist_source(checklist_root: Path, item: dict, output_root: Path) -> dict | None:
    ccs = CHECKLIST_CC_BY_DOC.get(str(item["docId"]))
    if not ccs:
        return None
    sources = [find_checklist_pdf(checklist_root, cc) for cc in ccs]
    out_dir = output_root / "checklist" / item["docId"]
    clean_dir(out_dir)
    pdf = out_dir / "checklist.pdf"
    if len(sources) == 1:
        shutil.copy2(sources[0], pdf)
    else:
        run(["pdfunite", *(str(source) for source in sources), str(pdf)])
    cc_label = "+".join(ccs)
    title = item["title"].split(".", 1)[-1].strip()
    return {
        "key": "checklist",
        "label": f"체크리스트 {cc_label}",
        "title": title,
        "source": " / ".join(str(source) for source in sources),
        "sourceFileTitle": " + ".join(source.name for source in sources),
        "renderMode": "pdf-checklist",
        "pdf": rel(pdf),
        "pageCount": pdf_page_count(pdf),
        "scope": "병력청취/신체진찰/환자교육/PPI/알고리즘 전체 체크리스트",
    }


def build(args: argparse.Namespace) -> dict:
    source_pdf = args.source_pdf.expanduser().resolve()
    cc_pdf_root = args.cc_pdf_root.expanduser().resolve()
    team4_root = args.team4_root.expanduser().resolve()
    team4_pdf_root = args.team4_pdf_root.expanduser().resolve()
    checklist_root = args.checklist_root.expanduser().resolve()
    output_root = args.output_root.expanduser().resolve()
    manifest_path = args.manifest.expanduser().resolve()

    needs_default_source_pdf = any(not item.get("ccPdf") and not item.get("sourcePdf") for item in REFERENCE_ITEMS)
    if needs_default_source_pdf and not source_pdf.exists():
        raise FileNotFoundError(source_pdf)
    if not cc_pdf_root.exists():
        raise FileNotFoundError(cc_pdf_root)
    if not team4_root.exists():
        raise FileNotFoundError(team4_root)
    if not args.skip_checklist and not checklist_root.exists():
        raise FileNotFoundError(checklist_root)

    clean_dir(output_root)
    items = {}
    for item in REFERENCE_ITEMS:
        hankeut = None if args.skip_hankeut else render_hankeut_pdf_excerpt(
            source_pdf,
            cc_pdf_root,
            item,
            output_root,
            dpi=args.dpi,
            quality=args.quality,
        )
        team4 = [] if args.skip_team4 else render_team4_sources(
            team4_root,
            team4_pdf_root,
            item,
            output_root,
            dpi=args.dpi,
            quality=args.quality,
        )
        checklist = None if args.skip_checklist else render_checklist_source(checklist_root, item, output_root)
        items[item["docId"]] = {
            "docId": item["docId"],
            "title": item["title"],
            "hankeut": hankeut,
            "team4": team4,
            "checklist": checklist,
        }

    manifest = {
        "version": "cpx-reference-assets.v6.single-slot-checklist",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "notes": {
            "hankeut": "한끝 PDF는 원본 PDF와 페이지 이미지 대체 렌더를 함께 보존한다. 핸드폰을 제외한 기기는 PDF 프레임으로 표시한다.",
            "team4": "4조 자료는 원본 PDF와 페이지 이미지 대체 렌더를 함께 보존한다. 핸드폰을 제외한 기기는 PDF 프레임으로 표시한다.",
            "checklist": "의학과 공부 파일/자료/한끝/체크리스트ocred.pdf를 CC별로 자른 체크리스트 PDF를 오른쪽 단일 참고 슬롯에 연결한다.",
            "singleSlot": "보기 모드 참고자료는 오른쪽 슬롯 하나에서 한끝, 체크리스트, 1부 대본을 순환 표시한다.",
            "scope": "공통/합본 대본은 제외하고 CC별 개별 자료만 연결한다.",
            "split40": "40-1 월경 이상과 40-2 월경통은 기존 40번 한끝 발췌본을 공유하고 4조 대본은 무월경/월경통으로 분리한다.",
        },
        "items": items,
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Build CC-specific reference assets for the CPX editor.")
    parser.add_argument("--source-pdf", type=Path, default=DEFAULT_SOURCE_PDF)
    parser.add_argument("--cc-pdf-root", type=Path, default=DEFAULT_CC_PDF_ROOT)
    parser.add_argument("--team4-root", type=Path, default=DEFAULT_TEAM4_ROOT)
    parser.add_argument("--team4-pdf-root", type=Path, default=DEFAULT_TEAM4_PDF_ROOT)
    parser.add_argument("--checklist-root", type=Path, default=DEFAULT_CHECKLIST_ROOT)
    parser.add_argument("--output-root", type=Path, default=REPO_ROOT / "assets" / "cpx-references")
    parser.add_argument("--manifest", type=Path, default=REPO_ROOT / "data" / "cpx-reference-manifest.json")
    parser.add_argument("--dpi", type=int, default=140)
    parser.add_argument("--quality", type=int, default=82)
    parser.add_argument("--skip-hankeut", action="store_true")
    parser.add_argument("--skip-team4", action="store_true")
    parser.add_argument("--skip-checklist", action="store_true")
    args = parser.parse_args()
    manifest = build(args)
    print(json.dumps({"ok": True, "items": list(manifest["items"].keys()), "manifest": str(args.manifest)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
