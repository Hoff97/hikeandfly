wget https://download1.graphhopper.com/public/europe/austria/photon-dump-austria-0.7-latest.jsonl.zst
wget https://download1.graphhopper.com/public/europe/italy/photon-dump-italy-0.7-latest.jsonl.zst
wget https://download1.graphhopper.com/public/europe/germany/photon-dump-germany-0.7-latest.jsonl.zst
wget https://download1.graphhopper.com/public/europe/france-monacco/photon-dump-france-monacco-0.7-latest.jsonl.zst
wget https://download1.graphhopper.com/public/europe/slovenia/photon-dump-slovenia-0.7-latest.jsonl.zst

zstd -d photon-dump-*.jsonl.zst