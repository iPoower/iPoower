#!/usr/bin/env python3
"""DATEX II DIR open data -> compact public feed; no user data or credentials."""
import argparse
import concurrent.futures
import datetime as dt
import json
import math
import os
import re
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

BASE = "https://tipi.bison-fute.gouv.fr/bison-fute-ouvert/publicationsDIR/Evenementiel-DIR/grt/RRN/"
SOURCE = "https://www.bison-fute.gouv.fr/donnees-sur-la-circulation-du.html"
LICENSE = "https://www.etalab.gouv.fr/wp-content/uploads/2017/04/ETALAB-Licence-Ouverte-v2.0.pdf"
MAX_XML = 12_000_000
MAX_GAP = 256
XSI = "{http://www.w3.org/2001/XMLSchema-instance}type"
TYPES = {
    "Accident": ("accident", "Accident"),
    "MaintenanceWorks": ("works", "Travaux"),
    "ConstructionWorks": ("works", "Travaux"),
    "VehicleObstruction": ("stopped_vehicle", "Véhicule immobilisé"),
    "GeneralObstruction": ("obstacle", "Obstacle"),
    "AnimalPresenceObstruction": ("obstacle", "Animal sur la route"),
    "EnvironmentalObstruction": ("obstacle", "Obstacle environnemental"),
    "InfrastructureDamageObstruction": ("obstacle", "Chaussée endommagée"),
    "WeatherRelatedRoadConditions": ("weather", "État de la route lié à la météo"),
    "RoadOrCarriagewayOrLaneManagement": ("restriction", "Restriction"),
    "ReroutingManagement": ("restriction", "Déviation"),
    "SpeedManagement": ("restriction", "Restriction de vitesse"),
    "GeneralNetworkManagement": ("restriction", "Gestion de la circulation"),
    "AbnormalTraffic": ("congestion", "Circulation perturbée"),
}

def local(node):
    return node.tag.split("}")[-1]

def nodes(node, name):
    return [n for n in node.iter() if local(n) == name]

def value(node, name):
    found = nodes(node, name)
    return (found[0].text or "").strip() if found else None

def number(text):
    try:
        n = float(text)
        return n if math.isfinite(n) else None
    except (ValueError, TypeError):
        return None

def timestamp(text):
    try:
        n = dt.datetime.fromisoformat(text.replace("Z", "+00:00"))
        return n.timestamp() if n.tzinfo is not None else None
    except (ValueError, TypeError, AttributeError):
        return None

def xml(data):
    if len(data) > MAX_XML or b"<!DOCTYPE" in data.upper() or b"<!ENTITY" in data.upper():
        raise ValueError("XML size/DTD rejected")
    root = ET.fromstring(data)
    if not nodes(root, "payloadPublication"):
        raise ValueError("DATEX publication absent")
    return root

def coords(node):
    if node is None:
        return None
    for p in nodes(node, "pointCoordinates"):
        lat, lon = number(value(p, "latitude")), number(value(p, "longitude"))
        if lat is not None and lon is not None and abs(lat) <= 90 and abs(lon) <= 180:
            return [lon, lat]
    return None

def normalize(record, situation, now):
    source_id = record.attrib.get("id")
    raw_type = record.attrib.get(XSI, "").split(":")[-1]
    if not source_id or raw_type not in TYPES:
        return None
    if value(record, "validityStatus") != "definedByValidityTimeSpec" or value(record, "end") == "true":
        return None
    start, end = value(record, "overallStartTime"), value(record, "overallEndTime")
    if timestamp(start) is None or timestamp(start) > now or (end and (timestamp(end) is None or timestamp(end) <= now)):
        return None
    if any(local(n).startswith("recurring") for n in record.iter()):
        return None
    periods = nodes(record, "validPeriod")
    if periods and not any(timestamp(value(p, "startOfPeriod")) is not None and
                           timestamp(value(p, "endOfPeriod")) is not None and
                           timestamp(value(p, "startOfPeriod")) <= now < timestamp(value(p, "endOfPeriod"))
                           for p in periods):
        return None
    targets = nodes(record, "forVehiclesWithCharacteristicsOf")
    if targets:
        kinds = {value(t, "vehicleType") for t in targets}
        if kinds and not kinds.intersection({"car", "passengerCar", "allVehicles", None}):
            return None
        if any(local(n).endswith("Characteristic") for t in targets for n in t.iter()):
            return None
    locations = nodes(record, "groupOfLocations")
    if not locations:
        return None
    location = locations[0]
    linear = nodes(location, "tpegLinearLocation")
    point = coords(location)
    geometry = [point] if point else []
    if linear:
        children = {local(n): n for n in linear[0]}
        a, b = coords(children.get("from")), coords(children.get("to"))
        geometry = [a, b] if a and b else geometry
    if not geometry:
        return None
    kind, title = TYPES[raw_type]
    subtype = next((value(record, name) for name in
                    ["roadOrCarriagewayOrLaneManagementType", "vehicleObstructionType", "accidentType",
                     "maintenanceWorksType", "constructionWorkType", "abnormalTrafficType",
                     "weatherRelatedRoadConditionType", "generalObstructionType"]
                    if value(record, name)), None)
    if subtype in {"roadClosed", "carriagewayClosures", "roadClosure"}:
        kind, title = "closure", "Route fermée"
    if kind == "congestion":
        kind, title = {"queuingTraffic": ("jam", "Bouchon"), "stationaryTraffic": ("jam", "Circulation à l'arrêt"),
                       "slowTraffic": ("slowdown", "Ralentissement")}.get(subtype, (kind, title))
    comments = []
    for comment in nodes(record, "generalPublicComment"):
        values = nodes(comment, "value")
        chosen = next((v for v in values if v.attrib.get("lang") == "fr"), values[0] if values else None)
        if chosen is not None and chosen.text:
            comments.append(chosen.text.strip())
    restricted = number(value(record, "numberOfLanesRestricted"))
    lane_names = {"leftLane": "voie de gauche", "rightLane": "voie de droite", "middleLane": "voie centrale",
                  "hardShoulder": "bande d'arrêt d'urgence", "allLanes": "toutes les voies"}
    lanes = [lane_names.get(n.text, n.text) for n in nodes(location, "lane") if n.text]
    lane_info = (str(int(restricted)) + " voie(s) neutralisée(s)") if restricted is not None and restricted > 0 else None
    if lanes:
        lane_info = (lane_info + " · " if lane_info else "") + ", ".join(lanes)
    road = value(location, "roadNumber")
    if not road:
        for name in nodes(location, "name"):
            if value(name, "tpegOtherPointDescriptorType") == "linkName":
                road = value(name, "value")
                break
    severity = {"low": 1, "medium": 2, "high": 3, "highest": 3}.get(value(situation, "overallSeverity"))
    updated = value(record, "situationRecordVersionTime")
    if timestamp(updated) is None or timestamp(updated) > now + 60:
        return None
    return {
        "sourceId": source_id, "situationId": situation.attrib["id"], "type": kind, "subtype": subtype,
        "title": title, "description": " · ".join(dict.fromkeys(comments))[:1000] or None,
        "severity": severity, "status": "active", "latitude": geometry[0][1], "longitude": geometry[0][0],
        "geometry": {"type": "Point" if len(geometry) == 1 else "LineString", "coordinates": geometry[0] if len(geometry) == 1 else geometry},
        "roadNumber": road, "roadName": None, "direction": value(location, "tpegDirection"),
        "startTime": start, "endTime": end, "updatedAt": updated,
        "delaySeconds": number(value(record, "delayTimeValue")), "lengthMeters": number(value(record, "affectedRoadLength")),
        "currentSpeed": None, "freeFlowSpeed": None, "congestion": subtype if kind in {"congestion", "jam", "slowdown"} else None,
        "laneInfo": lane_info, "confidence": "high" if value(record, "reliable") == "true" else "unknown",
        "sourceUrl": SOURCE, "officialSource": True, "producer": value(record, "sourceIdentification") or "Bison Futé / DIR",
        "rawReference": source_id,
    }

def publication(data, now):
    root = xml(data)
    updated = value(root, "publicationTime")
    if timestamp(updated) is None or timestamp(updated) > now + 60:
        raise ValueError("Publication timestamp invalid")
    changes = {}
    for situation in nodes(root, "situation"):
        ident = situation.attrib.get("id")
        if not ident:
            raise ValueError("Situation id absent")
        if ident in changes:
            raise ValueError("Duplicate situation id")
        if value(situation, "informationStatus") != "real" or value(situation, "confidentiality") != "noRestriction":
            changes[ident] = None
            continue
        # Garder les enregistrements bruts côté serveur jusqu'à la fin du flux :
        # une validité qui commence pendant l'ingestion sera évaluée au bon instant.
        changes[ident] = situation
    return changes, updated, value(root, "feedType"), value(root, "updateMethod")

def download(name):
    if name not in {"content.xml", "index.txt"} and not re.fullmatch(r"\d{1,10}\.xml", name):
        raise ValueError("Invalid source path")
    request = urllib.request.Request(BASE + name, headers={"User-Agent": "RaceControl-DATEX-open-data/1.0", "Cache-Control": "no-cache"})
    with urllib.request.urlopen(request, timeout=40) as response:
        if response.status != 200 or not response.url.startswith(BASE):
            raise ValueError("Source status/redirect rejected")
        data = response.read(MAX_XML + 1)
        if len(data) > MAX_XML:
            raise ValueError("Source too large")
        return data

def sync(fetch=download, previous=None, now=None):
    clock = time.time if now is None else lambda: now
    deadline = time.monotonic() + 180
    source_fetch = fetch
    def bounded_fetch(name):
        if time.monotonic() > deadline:
            raise TimeoutError("Ingestion budget exceeded")
        data = source_fetch(name)
        if time.monotonic() > deadline:
            raise TimeoutError("Ingestion budget exceeded")
        return data
    def index():
        raw = bounded_fetch("index.txt").decode("ascii").strip()
        if not re.fullmatch(r"\d{1,10}", raw):
            raise ValueError("Invalid update index")
        return int(raw)
    target = index()
    # Reconstruire depuis le snapshot public à chaque passage. Ne jamais utiliser
    # le JSON filtré comme état DATEX : il omet les situations futures/suspendues.
    # Le téléphone ne télécharge que le résultat compact, jamais cet XML.
    situations, updated, sequence, method = publication(bounded_fetch("content.xml"), clock())
    if method != "snapshot" or not sequence or not re.fullmatch(r"\d{1,10}", sequence):
        raise ValueError("Snapshot cursor absent")
    cursor = int(sequence)
    if cursor > target:
        target = index()
    if cursor > target or target - cursor > MAX_GAP:
        raise ValueError("Incremental gap exceeds bounded ingestion")
    names = [str(i) + ".xml" for i in range(cursor + 1, target + 1)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for data in pool.map(bounded_fetch, names):
            changes, date, _, method = publication(data, clock())
            if method != "allElementUpdate":
                raise ValueError("Unsupported or partial update method")
            situations.update(changes)
            if timestamp(date) > timestamp(updated):
                updated = date
    now = clock()
    events = [event for situation in situations.values() if situation is not None
              for record in nodes(situation, "situationRecord") if (event := normalize(record, situation, now))]
    events.sort(key=lambda e: e["sourceId"])
    if len(events) > 2500 or len({e["sourceId"] for e in events}) != len(events):
        raise ValueError("Public payload event limit exceeded")
    return {"schema": 1, "provider": "datex", "complete": True, "cursor": target,
            "checkedAt": dt.datetime.fromtimestamp(now, dt.timezone.utc).isoformat(),
            "publicationTime": updated, "coverage": "Réseau routier national non concédé · DIR · couverture partielle",
            "attribution": "Bison Futé / services routiers de l'État (DIR)", "licenseUrl": LICENSE,
            "sourceUrl": SOURCE, "events": events, "flows": []}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--fixture-dir")
    parser.add_argument("--now")
    args = parser.parse_args()
    output = Path(args.output)
    fetch = (lambda name: (Path(args.fixture_dir) / name).read_bytes()) if args.fixture_dir else download
    now = timestamp(args.now) if args.now else None
    if args.now and now is None:
        raise ValueError("Invalid fixture time")
    started = time.monotonic()
    result = sync(fetch, now=now)
    payload = json.dumps(result, ensure_ascii=False, separators=(",", ":"))
    if len(payload.encode()) > 1_500_000:
        raise ValueError("Public payload size limit exceeded")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".tmp")
    temporary.write_text(payload)
    os.replace(temporary, output)
    print(json.dumps({"provider": "datex", "events": len(result["events"]), "cursor": result["cursor"],
                      "publicationTime": result["publicationTime"], "bytes": len(payload.encode()),
                      "seconds": round(time.monotonic() - started, 2)}))

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("DATEX sync failed: " + type(error).__name__, file=sys.stderr)
        sys.exit(1)
