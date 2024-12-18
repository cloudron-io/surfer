[0.4.0]
* Initial version

[0.4.1]
* Remove silly mediaLinks

[0.4.2]
* Fix app url

[0.4.3]
* Improve healthcheck

[0.5.0]
* Add settings ui

[0.5.1]
* Fix settings link
* Add selenium tests

[0.5.2]
* Support username and email login

[0.5.3]
* Support uploading the same file multiple times

[0.5.4]
* Fix upload files first time

[0.5.5]
* Use new base image

[0.5.6]
* Use new base image 0.9.0

[0.5.7]
* Add post install message
* Download files as attachments

[0.5.8]
* Various encoding bugfixes
* Make breadcumbs clickable

[0.6.0]
* Support multifile upload via the webinterface

[4.0.0]
* Implement token auth with redis backend
* Basic drag'n'drop support
* Use new base image v0.10.0
* Synchronize cli and server versions

[4.1.0]
* Add ability to download files from the UI

[4.1.1]
* Add directory listing sorting
* Replace github links with our own gitlab

[5.0.0]
* Allow directory listing to be configurable
* Refactor the UI

[5.1.0]
* Add directory upload support
* Improve drag'n'drop of files

[5.2.0]
* Disable folder listing by default
* Do not render welcome screen if folder listing is enabled

[5.3.0]
* Replacing redis token store with local json file
* Add upload progress reporting
* Minor interface improvements

[5.4.0]
* Use new Cloudron base image
* Send 404 status code correctly

[5.5.0]
* Add webdav endpoint support
* Use inline edit for rename
* Various interface layout fixes

[5.6.0]
* Add SFTP support

[5.7.0]
* Update to latest app package manifest

[5.8.0]
* Add access token support for better CI/CD integration
* Various UI fixes for preview thumbnails

[5.9.0]
* Rename `surfer_root` to `public`
* `surfer put` CLI has changed

[5.9.1]
* Visual improvements to give more space to content
* Add preview sidebar
* Update dependencies for securty fixes

[5.9.2]
* Improve public folder listing

[5.10.0]
* Update to new Cloudron base image

[5.10.1]
* Add breadcrumbs to public folder listing
* Minor UI improvements

[5.10.2]
* Fix public folder listing if path contains spaces #14
* Improve breadcrumb layout
* Fix chrome bug on file rename #15

[5.10.3]
* Sanitize username input to prevent LDAP DoS attack. Thanks to Alessio (d3lla) for reporting!

[5.10.4]
* Update screenshots
* (security) Use crypto.random instead of uuid to generate API tokens
* API tokens are now base64 safe (to make it suitable for masked GitLab CI variables)

[5.11.0]
* Improve file uploading through cli
* Purge remote files during surfer put with --delete flag
* Improve UI login behavior and autofocus

[5.11.1]
* Fix file uploading bug

[5.11.2]
* Allow ability to remove all files via cli
* Update all dependencies

[5.11.3]
* Fix public viewing of subfolders
* Add music type icon

[5.12.0]
* Add CORS support

[5.12.1]
* Fix extensive WebDAV usage by caching auth

[5.12.2]
* Fix crash in cli tool

[5.13.0]
* Rewritten UI in primevue
* Add support for listing folders first

[5.13.1]
* Rewritten UI in primevue
* Add support for listing folders first
* Ability to specify site title and favicon

[5.13.2]
* Add ability to password or user protect the site
* Update node modules

[5.13.3]
* Fix previews when site is protected

[5.13.4]
* Fix case where access restriction is on and public folder listing off

[5.13.5]
* Add file name to preview
* Allow to close preview
* Fix dialog closing when clicking on backdrop
* Update dependencies

[5.14.0]
* Enable multi-domain flag for setting domain aliases

[5.14.1]
* Fix upload progress

[5.15.0]
* Allow to have custom 404.htm(l) in root folder
* Fix back button
* Update to base image v3

[5.16.0]
* Add basic support for noscript usage
* Improve preview behavior
* Be more conform with web usage and create proper web links and allow initial selection to prepare multiselect
* Fix alphanumeric sorting

[5.16.1]
* Use proper mime-type database for content-type delivery
* Fix rename selection bug
* Allow keyboard up/down navigation

[5.16.2]
* Allow to set index filename

[5.16.3]
* Fixup various path encoding issues

[5.16.4]
* Fix public listing regression for folders with special characters

[5.16.5]
* Use secure cookies

[5.16.6]
* Fix action overflow in file listing

[5.16.7]
* Update base image to v3.2.0

[5.17.0]
* Update dependencies
* Reduce flickering on login
* Reduce padding in list

[5.17.1]
* Migrate to upstreamVerison in manifest
* Update dependencies

[5.17.2]
* Always protect /api/files/*
* Stop using GET /api/files/* in UI

[5.17.3]
* Send 401 status code instead of 200 when authentication is required first
* Update dependencies

[5.17.4]
* Update dependencies
* Only show preview for supported types to avoid immediate download
* Fix various vuejs warnings

[5.17.5]
* Update depenencies
* Fixup cli tool to report better error status codes

[5.17.6]
* Further cli tool exit status code fixes

[5.17.7]
* Fixup cli logout
* Update dependencies

[5.17.8]
* Remove timeout on upload
* Do not crash if upload is cancelled and headers are already sent

[5.17.9]
* Update dependencies

[5.17.10]
* Clear password protection session on user logout
* Fix settings dialog save button

[5.17.11]
* Update dependencies

[5.18.0]
* Move to vitejs as the buildtool
* Use nodejs 18.12.1

[6.0.0]
* Move from LDAP auth to Cloudron OpenID
* surfer cli now only works with API access tokens created in the admin UI
* WebDAV access requires an API access token as the password

[6.0.1]
* Update dependencies

[6.0.2]
* Fix minBoxVersion for OpenID support

[6.1.0]
* Update base image to 4.2.0

[6.1.1]
* New logo
* Update dependencies

[6.1.2]
* Fix landingpage logo overflow
* Update dependencies

[6.1.3]
* Some logo fixes
* CLI improvments
* Update dependencies

[6.2.0]
* Port UI to Pankow toolkit
* Add dark mode
* Small CLI fixes

[6.2.1]
* Move UI away from superagent to pankow
* Replace various old code with nodejs built-ins
* Update dependencies

[6.2.2]
* Ensure folders if they don't exist on file upload
* Refactor code to use esm modules
* Update nodejs

[6.2.3]
* Ensure we load the configuration as early as possible to know the custom index document

[6.3.0]
* Update surfer to 6.3.0

