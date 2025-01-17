$(function () {
    var base = document.getElementById("base-url").getAttribute("href").slice(0, -1);

    $(".rw .my-checks-name").click(function() {
        var code = $(this).closest("tr.checks-row").attr("id");
        var url = base + "/checks/" + code + "/name/";

        $("#update-name-form").attr("action", url);
        $("#update-name-input").val(this.dataset.name);

        var tagsSelectize = document.getElementById("update-tags-input").selectize;
        tagsSelectize.setValue(this.dataset.tags.split(" "));

        $("#update-desc-input").val(this.dataset.desc);
        $('#update-name-modal').modal("show");
        $("#update-name-input").focus();

        return false;
    });

    $(".integrations").tooltip({
        container: "body",
        selector: "span",
        title: function() {
            var idx = $(this).index();
            return $("#ch-" + idx).data("title");
        }
    });

    $(".rw .integrations").on("click", "span", function() {
        var isOff = $(this).toggleClass("off").hasClass("off");
        var token = $('input[name=csrfmiddlewaretoken]').val();

        var idx = $(this).index();
        var checkCode = $(this).closest("tr.checks-row").attr("id");
        var channelCode = $("#ch-" + idx).data("code");

        var url = base + "/checks/" + checkCode + "/channels/" + channelCode + "/enabled";

        $.ajax({
            url: url,
            type: "post",
            headers: {"X-CSRFToken": token},
            data: {"state": isOff ? "off" : "on"}
        });

        return false;
    });

    $(".last-ping").on("click", function() {
        if (this.innerText == "Never") {
            return false;
        }

        $("#ping-details-body").text("Updating...");
        $('#ping-details-modal').modal("show");

        var code = $(this).closest("tr.checks-row").attr("id");
        var lastPingUrl = base + "/checks/" + code + "/last_ping/";
        $.get(lastPingUrl, function(data) {
            $("#ping-details-body" ).html(data);
            var htmlPre = $("#email-body-html pre");
            if (htmlPre.length) {
                var opts = {USE_PROFILES: {html: true}};
                var clean = DOMPurify.sanitize(htmlPre.text(), opts);
                var blob = new Blob([clean], {type: "text/html; charset=utf-8"});

                var iframe = document.createElement("iframe");
                iframe.sandbox = "";
                iframe.src = URL.createObjectURL(blob);

                htmlPre.replaceWith(iframe);
            }
        });

        var logUrl = base + "/checks/" + code + "/log/";
        $("#ping-details-log").attr("href", logUrl);

        return false;
    });

    $(".last-ping").tooltip({
        selector: ".label-confirmation",
        title: 'The word "confirm" was found in request body'
    });

    function applyFilters() {
        // Make a list of currently checked tags:
        var checked = [];
        var qs = [];
        $("#my-checks-tags .checked").each(function(index, el) {
            checked.push(el.textContent);
            qs.push({"name": "tag", "value": el.textContent});
        });

        var search = $("#search").val().toLowerCase();
        if (search) {
            qs.push({"name": "search", "value": search});
        }

        // Update hash
        if (window.history && window.history.replaceState) {
            var url = $("#checks-table").data("list-url");
            if (qs.length) {
                url += "?" + $.param(qs);
            }
            window.history.replaceState({}, "", url);
        }

        // No checked tags and no search string: show all
        if (checked.length == 0 && !search) {
            $("#checks-table tr.checks-row").show();
            return;
        }

        function applySingle(index, element) {
            if (search) {
                var code = element.getAttribute("id");
                var name = $(".my-checks-name", element).attr("data-name").toLowerCase();
                if (name.indexOf(search) == -1 && code.indexOf(search) == -1) {
                    $(element).hide();
                    return;
                }
            }

            if (checked.length) {
                // use attr(), as data() tries converting strings to JS types:
                // (e.g., "123" -> 123)
                var tags = $(".my-checks-name", element).attr("data-tags").split(" ");
                for (var i=0, tag; tag=checked[i]; i++) {
                    if (tags.indexOf(tag) == -1) {
                        $(element).hide();
                        return;
                    }
                }
            }

            $(element).show();
        }

        // For each row, see if it needs to be shown or hidden
        $("#checks-table tr.checks-row").each(applySingle);
    }

    // User clicks on tags: apply filters
    $("#my-checks-tags div").click(function() {
        $(this).toggleClass('checked');
        applyFilters();
    });

    // User changes the search string: apply filters
    $("#search").keyup(applyFilters);

    $(".show-log").click(function(e) {
        var code = $(this).closest("tr.checks-row").attr("id");
        var url = base + "/checks/" + code + "/details/";
        window.location = url;
        return false;
    });


    $(".pause").tooltip({
        title: "Pause this check?<br />Click again to confirm.",
        trigger: "manual",
        html: true
    });

    $(".pause").click(function() {
        var btn = $(this);

        // First click: show a confirmation tooltip
        if (!btn.hasClass("confirm")) {
            btn.addClass("confirm").tooltip("show");
            return false;
        }

        // Second click: update UI and pause the check
        btn.removeClass("confirm").tooltip("hide");
        var code = btn.closest("tr.checks-row").attr("id");
        $("#" + code + " span.status").attr("class", "status ic-paused");

        var url = base + "/checks/" + code + "/pause/";
        var token = $('input[name=csrfmiddlewaretoken]').val();
        $.ajax({
            url: url,
            type: "post",
            headers: {"X-CSRFToken": token}
        });

        return false;
    });

    $(".pause").mouseleave(function() {
        $(this).removeClass("confirm").tooltip("hide");
    });

    $('[data-toggle="tooltip"]').tooltip({
        html: true,
        container: "body",
        title: function() {
            var cssClasses = this.getAttribute("class");
            if (cssClasses.indexOf("ic-new") > -1)
                return "New. Has never received a ping.";
            if (cssClasses.indexOf("ic-paused") > -1)
                return "Monitoring paused. Ping to resume.";

            if (cssClasses.indexOf("sort-name") > -1)
                return "Sort by name<br />(but failed always first)";

            if (cssClasses.indexOf("sort-last-ping") > -1)
                return "Sort by last ping<br />(but failed always first)";
        }
    });

    // Schedule refresh to run every 3s when tab is visible and user
    // is active, every 60s otherwise
    var lastStatus = {};
    var lastStarted = {};
    var lastPing = {};
    var statusUrl = $("#checks-table").data("status-url");
    function refreshStatus() {
        $.ajax({
            url: statusUrl,
            dataType: "json",
            timeout: 2000,
            success: function(data) {
                for(var i=0, el; el=data.details[i]; i++) {
                    if (lastStatus[el.code] != el.status) {
                        lastStatus[el.code] = el.status;
                        $("#" + el.code + " span.status").attr("class", "status ic-" + el.status);
                    }

                    if (lastStarted[el.code] != el.started) {
                        lastStarted[el.code] = el.started;
                        $("#" + el.code + " .spinner").toggleClass("started", el.started);
                    }

                    if (lastPing[el.code] != el.last_ping) {
                        lastPing[el.code] = el.last_ping;
                        $("#lpd-" + el.code).html(el.last_ping);
                    }
                }

                $("#my-checks-tags div").each(function(a) {
                    var status = data.tags[this.innerText];
                    if (lastStatus[this.innerText] == status)
                        return;

                    $(this).removeClass("up grace down").addClass(status);
                    lastStatus[this.innerText] = status;
                });

                if (document.title != data.title) {
                    document.title = data.title;
                }
            }
        });
    }

    // Schedule regular status updates:
    if (statusUrl) {
        adaptiveSetInterval(refreshStatus);
    }

    // Copy to clipboard
    var clipboard = new ClipboardJS('button.copy-link');
    $("button.copy-link").mouseout(function(e) {
        setTimeout(function() {
            e.target.textContent = "copy";
        }, 300);
    });

    clipboard.on('success', function(e) {
        e.trigger.textContent = "copied!";
        e.clearSelection();
    });

    clipboard.on('error', function(e) {
        var text = e.trigger.getAttribute("data-clipboard-text");
        prompt("Press Ctrl+C to select:", text)
    });

    // Configure Selectize for entering tags
    function divToOption() {
        return {value: this.textContent};
    }

    $("#update-tags-input").selectize({
        create: true,
        createOnBlur: true,
        delimiter: " ",
        labelField: "value",
        searchField: ["value"],
        hideSelected: true,
        highlight: false,
        options: $("#my-checks-tags div").map(divToOption).get()
    });

});
