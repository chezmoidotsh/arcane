# errors.inc
#
# Pure-Caddy inline error responder (single-include).
# Based on tarampampam/error-pages "l7" theme.

handle_errors {
    # Force HTML content type for the error page
    header Content-Type text/html

    # Respond inline with the original status code.
    respond `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>{http.error.status_code} — {http.error.status_text}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        :root {
            --color-primary: #f7fafc;
            --color-inverted: #a0aec0;
        }

        @media (prefers-color-scheme: dark) {
            :root {
                --color-primary: #222526;
                --color-inverted: #fff;
            }
        }

        html, body {
            margin: 0;
            padding: 0;
            min-height: 100%;
            height: 100%;
            width: 100%;
            background-color: var(--color-primary);
            color: var(--color-inverted);
            font-family: sans-serif;
            font-size: 16px;
            word-break: keep-all;
        }

        body {
            display: flex;
            justify-content: center;
            align-items: center;
        }

        article {
            display: flex;
            align-items: center;
            justify-content: center;
        }

        article .code h1,
        article .desc p {
            font-size: 1.7em;
            margin: 0;
            padding: 0;
        }

        article .code {
            border-right: 2px solid;
            padding: 0.12em 0.7em;
            margin: 0;
            text-align: right;
        }

        article .code h1 {
            font-weight: normal;
        }

        article .desc {
            text-align: left;
            padding: 0.7em;
        }

        article .desc p {
            font-weight: lighter;
            text-transform: uppercase;
        }

        ul.details {
            list-style: none;
            margin: 1.25em 0 0 0;
            padding: 0;
            font-size: 0.75em;
            opacity: 0.6;
        }

        ul.details li {
            height: 1.5em; /* Ensure alignment */
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        ul.details .name {
            font-weight: bold;
            text-transform: capitalize;
        }

        ul.details li.value {
            font-family: monospace;
        }
    </style>
</head>
<body>
    <article>
        <div class="code">
            <h1>{http.error.status_code}</h1>
            <ul class="details">
                <li class="name">Host</li>
                <li class="name">Original URI</li>
                <li class="name">Forwarded for</li>
                <li class="name">Request ID</li>
                <li class="name">Timestamp</li>
            </ul>
        </div>
        <div class="desc">
            <p>{http.error.status_text}</p>
            <ul class="details">
                <li class="value">{host}</li>
                <li class="value">{uri}</li>
                <li class="value">{header.X-Forwarded-For}</li>
                <li class="value">{http.vars.request_id}</li>
                <li class="value">{time.now.common_log}</li>
            </ul>
        </div>
    </article>
    <script>
        (function() {
            const values = document.querySelectorAll('.desc .details li');
            const labels = document.querySelectorAll('.code .details li');
            values.forEach((v, i) => {
                const text = v.textContent.trim();
                if (!text || (text.startsWith('{') && text.endsWith('}'))) {
                    v.style.display = 'none';
                    if (labels[i]) labels[i].style.display = 'none';
                }
            });
        })();
    </script>
</body>
</html>
` {http.error.status_code}
}
