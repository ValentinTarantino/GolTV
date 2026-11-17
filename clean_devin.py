import re
from git_filter_repo import FilteringOptions, RepoFilter

def clean_message(commit, metadata):
    message = commit.message.decode("utf-8", errors="replace")

    message = re.sub(
        r"(?im)^\s*Generated with \[Devin\]\(https?://devin\.ai\)\s*\n?",
        "",
        message
    )

    message = re.sub(
        r"(?im)^\s*Co-Authored-By:\s*Devin\s*<[^>]+>\s*\n?",
        "",
        message
    )

    message = re.sub(r"\n{3,}", "\n\n", message).strip() + "\n"
    commit.message = message.encode("utf-8")

RepoFilter(
    FilteringOptions.parse_args([
        "--force",
        "--refs",
        "refs/heads/main"
    ]),
    commit_callback=clean_message
).run()
