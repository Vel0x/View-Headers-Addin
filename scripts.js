Office.initialize = function (reason) {
    $(document).ready(function () {
        sendHeadersRequest();
    });
}

function escapeHTML(s) { 
    return s.replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
}

function parseHeadersToHtml(headers) {

    var htmlTable = "<Table>";

    var lines = headers.match(/^.*([\n\r]+|$)/gm);

    var headerList = [];
    var iNextHeader = 0;
    for (var iLine = 0 ; iLine < lines.length ; iLine++) {
        var match = lines[iLine].match(/(^[\w-\.]*?): ?(.*)/);

        // There's one false positive we might get: if the time in a Received header has been
        // folded to the next line, the line might start with something like "16:20:05 -0400".
        // This matches our regular expression. The RFC does not preclude such a header, but I've
        // never seen one in practice, so we check for and exclude 'headers' that
        // consist only of 1 or 2 digits.
        if (match && match[1] && !match[1].match(/^\d{1,2}$/)) {
            headerList[iNextHeader] = {"header":match[1], "value":match[2]};
            iNextHeader++;
        } else {
            if (iNextHeader > 0) {
                // Tack this line to the previous line
                headerList[iNextHeader - 1]["value"] += " " + lines[iLine];
            } else {
                // If we didn't have a previous line, go ahead and use this line
                if (lines[iLine].match(/\S/g)) {
                    headerList[iNextHeader] = {"header":"", "value":lines[iLine]};
                    iNextHeader++;
                }
            }
        }
    }

    for (var i = 0; i < headerList.length; i++) {
        headerList[i]["header"] = escapeHTML(headerList[i]["header"]);
        headerList[i]["value"] = escapeHTML(headerList[i]["value"]);
        htmlTable = htmlTable + "<tr><td class=\"header_cell\">" + headerList[i]["header"] + "</td><td class=\"value_cell\">" + headerList[i]["value"] + "</td></tr>"
    }

    htmlTable = htmlTable + "</Table>";

    return htmlTable;
}


function getSoapEnvelope(request) {
    // Wrap an Exchange Web Services request in a SOAP envelope.
    var result =
    "<?xml version='1.0' encoding='utf-8'?>" +
    "<soap:Envelope xmlns:xsi='http://www.w3.org/2001/XMLSchema-instance'" +
    "               xmlns:m='http://schemas.microsoft.com/exchange/services/2006/messages'" +
    "               xmlns:xsd='http://www.w3.org/2001/XMLSchema'" +
    "               xmlns:soap='http://schemas.xmlsoap.org/soap/envelope/'" +
    "               xmlns:t='http://schemas.microsoft.com/exchange/services/2006/types'>" +
    "  <soap:Header>" +
    "     <t:RequestServerVersion Version='Exchange2013'/>" +
    "  </soap:Header>" +
    "  <soap:Body>" +
    request +
    "  </soap:Body>" +
    "</soap:Envelope>";

    return result;
}

function getHeadersRequest(id) {
    // Return a GetItem EWS operation request for the headers of the specified item.
    var result =
    "    <GetItem xmlns='http://schemas.microsoft.com/exchange/services/2006/messages'>" +
    "      <ItemShape>" +
    "        <t:BaseShape>IdOnly</t:BaseShape>" +
    "        <t:BodyType>Text</t:BodyType>" +
    "        <t:AdditionalProperties>" +
    "            <t:ExtendedFieldURI PropertyTag='0x007D' PropertyType='String' />" +
    "            <t:ExtendedFieldURI PropertyTag='0x0E05' PropertyType='String' />" +
    "            <t:FieldURI FieldURI='item:HasAttachments' />" +
    "        </t:AdditionalProperties>" +
    "      </ItemShape>" +
    "      <ItemIds><t:ItemId Id='" + id + "'/></ItemIds>" +
    "    </GetItem>";

    return result;
}


function sendHeadersRequest() {

    var mailbox = Office.context.mailbox;
    var request = getHeadersRequest(mailbox.item.itemId);
    var envelope = getSoapEnvelope(request);

    try {
        mailbox.makeEwsRequestAsync(envelope, headerCallback);
    } catch (e) {
        displayError("Failed to get headers.");
    }
}

function displayHeaders(headers) {
    document.getElementById("headers").innerHTML = parseHeadersToHtml(headers);
}

function displayError(errorText) {
    document.getElementById("headers").innerHTML = errorText;
}

// Function called when the EWS request is complete.
function headerCallback(asyncResult) {

    var originalHeaders = "";

    if (!asyncResult.value)
    {
        displayError(asyncResult.error);
        return;
    }

    var prop = null;
    try {
        var response = $.parseXML(asyncResult.value);
        var responseDOM = $(response);

        if (responseDOM) {

            responseDOM.find("t\\:ExtendedProperty").each(function (i, j) {
                var propertyTag = $(j).find("t\\:ExtendedFieldURI").attr("PropertyTag");
                var textContent = j.textContent;

                if (propertyTag == '0x7d') {
                    originalHeaders = textContent;
                } 
            });

            // Webkit, doesn't like the namespace in find method, so lets try again without the namespace
            if (originalHeaders.length == 0) {
                responseDOM.find("ExtendedProperty").each(function (i, j) {
                    var propertyTag = $(j).find("ExtendedFieldURI").attr("PropertyTag");
                    var textContent = j.textContent;

                    if (propertyTag == '0x7d') {
                        originalHeaders = textContent;
                    }
                });
            }

        }
    } catch (e) {
    }

    if (originalHeaders.length > 0) {
        displayHeaders(originalHeaders);
    } else {
        displayError("The email didn't have any headers.");
    }
}
