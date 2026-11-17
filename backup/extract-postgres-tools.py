import hashlib,json,pathlib,zipfile
root=pathlib.Path("E:/SimScopeData/Backups/FarmplastPayroll/tools").resolve()
archive=root/"postgresql-17.12-1-windows-x64-binaries.zip"
expected="a2cd8a774389347b70be7748ac4a37ef43cb6ee539c5fc3e85ae264b15e4a04c"
with archive.open("rb") as f:
    if hashlib.file_digest(f,"sha256").hexdigest()!=expected: raise RuntimeError("Postgres package checksum mismatch")
with zipfile.ZipFile(archive) as z:
    selected=[n for n in z.namelist() if n.startswith(("pgsql/bin/","pgsql/lib/","pgsql/share/")) and not n.endswith("/")]
    if not selected: raise RuntimeError("Postgres package layout mismatch")
    for n in selected:
        dest=(root/n).resolve()
        if not dest.is_relative_to(root) or ".." in pathlib.PurePosixPath(n).parts: raise RuntimeError("Unsafe binary path")
        z.extract(n,root)
print(json.dumps({"extracted_files":len(selected),"archive_sha256":expected}))
