# Legal Content

The German and English privacy policy components are verbatim copies of the
corresponding Tobiga source files:

- `PrivacyDe.jsx`
- `PrivacyEn.jsx`

Replace the contents of the two imprint `.html` files with the supplied legal
text:

- `imprint.en.html`
- `imprint.de.html`

Use HTML fragments rather than a complete document: omit `<html>`, `<head>`, and `<body>`. The app supplies the localized page heading, so the fragment can start with the first paragraph or subsection. The files are trusted build-time content and are bundled into the web application.
