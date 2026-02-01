// Para usar, crie uma layer de texto e escreva "Nome do Participante".
// Depois, rode o script no Photoshop.
// O arquivo CSV precisa estar formatada no seguinte formato:
// Nome 1,
// Nome 2,
// e assim por diante.

#target photoshop

var csvFilePath = "LOCAL DA LISTA (CSV) COM NOMES";
var outputFolderPath = "LOCAL PARA SALVAR OS CERTIFICADOS CRIADOS";

function main() {
    if (!app.documents.length) {
        alert("Please open the template Photoshop file first.");
        return;
    }

    var doc = app.activeDocument;

    var participantLayer = null;
    for (var i = 0; i < doc.layers.length; i++) {
        var layer = doc.layers[i];
        if (layer.kind == LayerKind.TEXT && layer.name === "Nome do Participante") {
            participantLayer = layer;
            break;
        }
    }

    if (!participantLayer) {
        alert('A layer de texto "Nome do Participante" não foi encontrada.');
        return;
    }

    var csvFile = new File(csvFilePath);
    if (!csvFile.exists) {
        alert("O arquivo CSV não foi encontrado em: " + csvFilePath);
        return;
    }

    csvFile.open("r");
    var csvContent = csvFile.read();
    csvFile.close();

    var lines = splitLines(csvContent);

    var names = [];
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.length === 0) continue;

        var parts = line.split(",");
        if (parts.length < 2) continue;

        var name = parts[1].replace(/^\s+|\s+$/g, "");
        if (name.length === 0) continue;

        names.push(name);
    }

    if (names.length === 0) {
        alert("Não foi encontrado nenhum nome no arquivo CSV.");
        return;
    }

    for (var j = 0; j < names.length; j++) {
        var name = names[j];
        participantLayer.textItem.contents = name;

        var safeName = name.replace(/[\\\/:\*\?"<>\|]/g, "_");
        var outputFile = new File(outputFolderPath + "/" + safeName + ".png");

        savePNG(doc, outputFile);
    }

    alert("Todos os certificados foram exportados com sucesso!");
}

function savePNG(doc, saveFile) {
    var opts = new PNGSaveOptions();
    opts.compression = 9;
    opts.interlaced = false;

    doc.saveAs(saveFile, opts, true, Extension.LOWERCASE);
}

function splitLines(str) {
    var lines = [];
    var start = 0;
    for (var i = 0; i < str.length; i++) {
        if (str.charAt(i) === '\r') {
            lines.push(str.substring(start, i));
            if (str.charAt(i + 1) === '\n') i++;
            start = i + 1;
        } else if (str.charAt(i) === '\n') {
            lines.push(str.substring(start, i));
            start = i + 1;
        }
    }
    if (start < str.length) {
        lines.push(str.substring(start));
    }
    return lines;
}

main();