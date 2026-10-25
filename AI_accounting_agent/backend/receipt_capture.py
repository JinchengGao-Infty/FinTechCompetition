"""Offline receipt text and attributable field evidence. Never writes a bill."""
import csv
import hashlib
import io
import re
import shutil
import subprocess
import tempfile
from datetime import date
from decimal import Decimal, InvalidOperation
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError


class ReceiptError(ValueError):
    pass


@lru_cache(maxsize=1)
def capability():
    binary = shutil.which('tesseract')
    if not binary:
        return {'available': False, 'engine': None, 'languages': []}
    try:
        p = subprocess.run([binary, '--list-langs'], capture_output=True, text=True, timeout=5)
        languages = [x.strip() for x in p.stdout.splitlines() if x.strip() in {'chi_sim', 'eng', 'osd'}]
    except (OSError, subprocess.TimeoutExpired):
        return {'available': False, 'engine': None, 'languages': []}
    return {'available': p.returncode == 0 and 'eng' in languages,
            'engine': 'tesseract', 'languages': languages}


def read_receipt(data):
    available = capability()
    if not available['available']:
        raise ReceiptError('离线票据识别暂不可用')
    if not data or len(data) > 10 * 1024 * 1024:
        raise ReceiptError('请选择不超过10MB的票据图片')
    try:
        with Image.open(io.BytesIO(data)) as original:
            if original.format not in {'PNG', 'JPEG', 'WEBP'}:
                raise ReceiptError('请选择PNG、JPEG或WebP图片')
            if original.width * original.height > 16_000_000:
                raise ReceiptError('图片分辨率过大，请裁切票据后重试')
            image = ImageOps.exif_transpose(original).convert('RGB')
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ReceiptError('图片无法读取，请重新选择') from exc
    language = 'chi_sim+eng' if 'chi_sim' in available['languages'] else 'eng'
    with tempfile.TemporaryDirectory(prefix='finpilot-receipt-') as directory:
        p = Path(directory) / 'receipt.png'
        image.save(p)
        try:
            result = subprocess.run([shutil.which('tesseract'), str(p), 'stdout', '-l', language,
                                     '--psm', '6', 'tsv'], capture_output=True, timeout=25)
        except subprocess.TimeoutExpired as exc:
            raise ReceiptError('识别超时，请裁切票据后重试') from exc
    if result.returncode:
        raise ReceiptError('图片识别未完成，请重新选择')
    words, lines = [], {}
    for row in csv.DictReader(io.StringIO(result.stdout.decode('utf-8', 'replace')), delimiter='\t'):
        value = row.get('text', '').strip()
        if not value:
            continue
        confidence = float(row['conf'])
        word = {'text': value, 'confidence': round(confidence, 2),
                'box': [int(row[k]) for k in ['left', 'top', 'width', 'height']]}
        words.append(word)
        key = (row['block_num'], row['par_num'], row['line_num'])
        lines.setdefault(key, []).append(value)
    text = '\n'.join(' '.join(values) for values in lines.values())
    text = re.sub(r'(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])', '', text)
    text = re.sub(r'(?<=\d)\s*\.\s*(?=\d)', '.', text).strip()
    if not text:
        raise ReceiptError('未识别到文字，请拍清票据后重试')
    if len(text) > 8000:
        raise ReceiptError('图片文字过多，请每次选择一张票据')
    dates = []
    for year, month, day in re.findall(r'(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})', text):
        try:
            dates.append(date(int(year), int(month), int(day)).isoformat())
        except ValueError:
            continue
    totals = []
    for line in text.splitlines():
        if re.search(r'实付|应付|实收|总计|合计|\bTOTAL\b|AMOUNT DUE', line, re.I):
            for amount in re.findall(r'(?<!\d)(\d{1,8}(?:,\d{3})*\.\d{2})(?!\d)', line):
                try:
                    totals.append(str(Decimal(amount.replace(',', '')).quantize(Decimal('0.01'))))
                except InvalidOperation:
                    continue
    return {'text': text, 'words': words, 'date_evidence': sorted(set(dates)),
            'total_evidence': sorted(set(totals)), 'document_sha256': hashlib.sha256(data).hexdigest(),
            'engine': available['engine'], 'languages': language,
            'confidence': round(sum(x['confidence'] for x in words) / len(words), 2)}


def verify_draft(parsed, evidence):
    """A model suggestion cannot invent a receipt date or substitute a line-item price."""
    if parsed.get('needs_clarification'):
        return parsed
    if re.search(r'\b(?:USD|EUR|HKD)\b|\$', evidence['text'], re.I):
        return {'needs_clarification': True, 'reason': '请核对票据币种，当前账本使用人民币'}
    if parsed.get('event_date') not in evidence['date_evidence']:
        return {'needs_clarification': True, 'reason': '票据日期不清楚，请核对日期'}
    total = str(Decimal(str(parsed.get('amount', 0))).quantize(Decimal('0.01')))
    if len(evidence['total_evidence']) != 1 or total != evidence['total_evidence'][0]:
        return {'needs_clarification': True, 'reason': '票据实付金额需核对'}
    return parsed
