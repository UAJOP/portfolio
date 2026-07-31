from pathlib import Path

path = Path("joyday-paint.html")
text = path.read_text(encoding="utf-8")
malformed = (
    '<img alt="Joyday artwork preview" data-joyday-preview-img / '
    'src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">'
)
correct = (
    '<img alt="Joyday artwork preview" data-joyday-preview-img '
    'src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="/>'
)

if malformed in text:
    text = text.replace(malformed, correct, 1)
elif correct not in text:
    raise RuntimeError("Joyday preview image tag was not found in an expected state")

if " / src=" in text:
    raise RuntimeError("A malformed self-closing image tag still remains")

path.write_text(text, encoding="utf-8")
print("Joyday preview image tag repaired.")
