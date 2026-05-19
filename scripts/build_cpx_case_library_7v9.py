import json,re
from pathlib import Path
ROOT=Path('/Users/sffs123gmail.com/.openclaw/workspace')
CAN=ROOT/'.tmp/cpx_9pdf/9th_original_canonical_cases.json'
RAW=ROOT/'hankkeut_cases_raw.json'
OUT=ROOT/'kmle-planner-share/data/cpx-case-library-7v9.js'
REPORT_DIR=ROOT/'.tmp/cpx_7v9'
canonical=json.loads(CAN.read_text(encoding='utf-8'))
raw=json.loads(RAW.read_text(encoding='utf-8'))

def norm(s):
    return re.sub(r'\s+',' ',str(s or '')).strip()

def clean(s):
    s=str(s or '').replace('\x00','')
    s=re.sub(r'\n{4,}','\n\n\n',s)
    return s.strip()

def key(cc):
    cc=str(cc)
    if cc in raw: return cc
    a=cc.split('-')[0]
    return a.zfill(2) if a.isdigit() else cc

def find_case_blocks(section, cases):
    text=raw.get(key(section['cc']),{}).get('raw_text') or ''
    if not text: return {}
    positions=[]
    for c in cases:
        pl=c.get('patient_line','')
        # Prefer name+age anchors. OCR symbols around 조사 are unstable, names are stable enough.
        name=''; age=''
        m=re.search(r'(\d+)\s*세?\s*(?:남자|여자|남성|여성)?\s*([가-힣]{2,5})씨', pl)
        if m: age,name=m.group(1),m.group(2)
        candidates=[]
        if name:
            for mm in re.finditer(re.escape(name), text): candidates.append(mm.start())
        if not candidates:
            snippet=norm(pl).replace('•','').replace('.','')[:24]
            if snippet:
                i=norm(text).find(snippet)
                if i>=0: candidates.append(i)
        if candidates:
            # choose occurrence that looks like a case stem: nearest previous '실전모의증례' or bullet nearby.
            best=min(candidates, key=lambda x: abs(x-(positions[-1][1]+1000 if positions else 0))) if candidates else -1
            positions.append((c['case_id'], best))
    positions=sorted({cid:pos for cid,pos in positions}.items(), key=lambda x:x[1])
    blocks={}
    starts=[m.start() for m in re.finditer(r'실전\s*모의\s*증례', text)]
    # If the source has one clear 실전모의증례 marker per case, use it as a safer sequential fallback.
    if len(starts) >= len(cases):
        for idx,c in enumerate(cases):
            if idx >= len(starts): break
            start=starts[idx]
            end=starts[idx+1] if idx+1 < len(starts) else len(text)
            blocks[c.get('case_id')]=clean(text[start:end].strip()[:8500])
    for idx,(cid,pos) in enumerate(positions):
        start=max(0, max(text.rfind('실전모의증례', 0, pos), text.rfind('실전 모의 증례', 0, pos)))
        if start<0 or pos-start>900: start=max(0, pos-160)
        end=positions[idx+1][1] if idx+1<len(positions) else len(text)
        block=text[start:end].strip()
        if block:
            blocks[cid]=clean(block[:8500])
    return blocks

# 7판 preservation notes from reports
report_files=[
 'metabolic_part_report.md','circulation_part_report.md','digestive_part_report.md','respiratory_part_report.md','resp_part_report.md','renal_part_report.md','systemic_part_report.md','msk_part_report.md','psych_part_report.md','neuro_part_report.md','women_child_part_report.md','women_part_report.md','peds_part_report.md','counsel_part_report.md'
]
cc_notes={}
current_cc=None
for rf in report_files:
    p=REPORT_DIR/rf
    if not p.exists(): continue
    lines=p.read_text(encoding='utf-8',errors='ignore').splitlines()
    for line in lines:
        h=re.match(r'##+\s*CC\s*([0-9]{1,2}(?:-[12])?)\.?\s*(.+)', line)
        if h:
            current_cc=str(int(h.group(1).split('-')[0]))
        if '7판 보존 후보' in line or '7판-only' in line or '보존할 후보' in line or '보존 후보' in line:
            if current_cc: cc_notes.setdefault(current_cc,[]).append({'text':re.sub(r'^[#\-\s]+','',line).strip(), 'source':rf})
        elif current_cc and re.match(r'\s*-\s+\*\*.+\*\*', line):
            txt=re.sub(r'\s*-\s+','',line).strip()
            if any(w in txt for w in ['7판','후보','감별','stem','주진단','only','보존']):
                cc_notes.setdefault(current_cc,[]).append({'text':txt, 'source':rf})
# curated high-level from summary if sparse
summary=REPORT_DIR/'CPX_7v9_all_parts_progress_summary.md'
if summary.exists():
    # keep broad notes under relevant cc can't map fully, so don't overstuff
    pass

lib={'meta':{'ninthCaseCount':0,'ccCount':0,'note':'9판 canonical 증례 카드 + case별 9판 raw 원문 블록 + 7판 비교 리포트의 보존 후보 요약. 7판 전문 OCR은 sourcePaths 참조.','sources':[str(CAN.relative_to(ROOT)),str(RAW.relative_to(ROOT)),'.tmp/cpx_7v9/*_part_report.md','.tmp/cpx_7v9/*_7th_ocr.txt']},'cc':{}}
for sec in canonical['sections']:
    cc=str(int(str(sec['cc']).split('-')[0])) if str(sec['cc']).split('-')[0].isdigit() else str(sec['cc'])
    ent=lib['cc'].setdefault(cc, {'id':cc,'ccLabels':[], 'title':sec['title'], 'ninthCases':[], 'seventhPreserve':[]})
    label=f"{sec['cc']} {sec['title']}"
    if label not in ent['ccLabels']: ent['ccLabels'].append(label)
    blocks=find_case_blocks(sec, sec.get('cases') or [])
    for c in sec.get('cases') or []:
        ent['ninthCases'].append({
            'caseId':c.get('case_id'), 'caseNo':c.get('case_no'), 'cc':sec['cc'], 'ccTitle':sec['title'], 'edition':'9판', 'kind':c.get('kind'),
            'stem':clean(c.get('patient_line')), 'diagnoses':c.get('items') or [], 'sourcePageRange':c.get('source_page_range'),
            'reviewFlag': bool(sec.get('special_review') or c.get('fallback')), 'blockSha1':c.get('block_sha1'),
            'rawText':blocks.get(c.get('case_id'), '')
        })
for cc,notes in cc_notes.items():
    if cc in lib['cc']:
        seen=set(); out=[]
        for n in notes:
            t=norm(n['text'])
            if len(t)<8 or t in seen: continue
            seen.add(t); out.append(n)
        lib['cc'][cc]['seventhPreserve']=out[:10]
lib['meta']['ccCount']=len(lib['cc'])
lib['meta']['ninthCaseCount']=sum(len(v['ninthCases']) for v in lib['cc'].values())
OUT.write_text('window.CPX_CASE_LIBRARY_7V9 = '+json.dumps(lib,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
print(json.dumps({'out':str(OUT),'cc':lib['meta']['ccCount'],'cases':lib['meta']['ninthCaseCount'],'raw_cases':sum(1 for v in lib['cc'].values() for c in v['ninthCases'] if c.get('rawText')),'notes':sum(len(v['seventhPreserve']) for v in lib['cc'].values()), 'bytes':OUT.stat().st_size},ensure_ascii=False,indent=2))
