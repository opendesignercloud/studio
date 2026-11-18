# Open Designer Cloud Studio

Free image and document tools that run in your browser or on your desktop. Your files stay on your computer: nothing is uploaded.

This repository holds the source code of the tools released so far. More are released over time.

| Tool | What it does |
|---|---|
| Convert image | Change an image to PNG, JPG, WebP and other formats |
| Compress image | Make an image smaller with a quality setting |
| Favicon generator | Make a full favicon set from one picture |
| Image to PDF | Turn pictures into a PDF |
| Merge PDF | Combine PDF files and reorder pages |
| QR codes | Make QR codes you can download |

The same tools are online at [opendesignercloud.com/studio](https://opendesignercloud.com/studio/), and are included in the Open Designer Cloud Studio Pro desktop app.

## Run it on your computer

The tools are plain HTML, CSS and JavaScript. Any static web server will do, as long as it serves this folder as the site root (the pages use absolute paths such as `/assets/studio/studio.js`):

```
python3 -m http.server 8080
```

Then open <http://localhost:8080/studio/>. Some site features (usage counts, sign-in mode, opening Stock items) call the opendesignercloud.com server and are skipped when it is not there; the tools work without them.

## Contributing

Bug reports and pull requests are welcome. Please sign off your commits (`git commit -s`) to confirm you have the right to contribute the code under this repository's licence. Tools in this repository are small and self contained: keep them free of build steps and of any network calls except to the user's own computer.

## Licence and credits

See `LICENSE`. Third-party libraries and their licences are listed in `THIRD-PARTY-NOTICES.txt`.

The name "Open Designer Cloud", "Studio", and the logo are trademarks of their owner and are not covered by the licence. You may not use them to suggest that a copy or modified version is the official one.
