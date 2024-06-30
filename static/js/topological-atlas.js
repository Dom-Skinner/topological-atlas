let globalDbMulti = null;
let d_mat = null;
let selectedSystems = [];

function populateTable(db_multi, d_mat) {
  const tableBody = document.querySelector('#systemTable tbody');
  console.log("Populating table with data:", db_multi);

  db_multi.forEach((system, index) => {
    if (system['System name'] && system['System name'] !== 'undefined') {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${system['System name']}</td>
        <td>${system['Number of samples']}</td>
        <td>${system['Number of points per sample (approximate)']}</td>
        <td>${system['Data source']}</td>
      `;
      row.setAttribute('data-id', index);
      row.addEventListener('click', () => toggleSelection(index,d_mat));
      tableBody.appendChild(row);
    }
  });
}


function toggleSelection(index,d_mat) {
  const row = document.querySelector(`#systemTable tbody tr[data-id="${index}"]`);
  if (selectedSystems.includes(index)) {
    selectedSystems = selectedSystems.filter(i => i !== index);
    row.classList.remove('selected');
  } else {
    selectedSystems.push(index);
    row.classList.add('selected');
  }
  console.log("Selected systems:", selectedSystems);
  console.log("Trying the d_mat:");
  console.log("d_mat:", d_mat);
  updatePlots(selectedSystems, globalDbMulti, d_mat);
}


async function fetchCSV(url) {
    const response = await fetch(url);
    const text = await response.text();
    return Papa.parse(text, { header: true }).data;
}

function pairwiseEuclidean(X) {
  const rows = X.length;
  const distances = Array(rows).fill().map(() => Array(rows).fill(0));
  
  for (let i = 0; i < rows; i++) {
      for (let j = i; j < rows; j++) {
          const diff = X[i].map((val, k) => val - X[j][k]);
          const dist = Math.sqrt(diff.reduce((sum, val) => sum + val ** 2, 0));
          distances[i][j] = dist;
          distances[j][i] = dist;  // The distance matrix is symmetric
      }
  }
  return distances;
}


function classicalMDS(D, dimensions = 3) {
  const n = D.length;

  function dmat2gram(D) {
    const n = D.length;
    const G = Array(n).fill().map(() => Array(n).fill(0));
    const u = Array(n).fill(0);
    let s = 0;

    for (let j = 0; j < n; j++) {
      u[j] = D[j].reduce((sum, d) => sum + d * d, 0) / n;
      s += u[j];
    }
    s /= n;

    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        G[i][j] = G[j][i] = (u[i] + u[j] - D[i][j] * D[i][j] - s) / 2;
      }
    }

    return G;
  }
  
  const G = dmat2gram(D);
  

  // Sort eigenvalues and eigenvectors
  const result = math.eigs(math.matrix(G));

  const result_d = druid.simultaneous_poweriteration(G, 4, {max_iterations:800,seed:32,tol:1e-12});
  console.log(`Computed eigs:`,result_d.eigenvalues);
 

  // Select top 'dimensions' positive eigenvalues and eigenvectors
  const λ = [];
  const U = [];
  for (let i = 0; i < 3 ; i++) {
    //  λ.push(sorted.values[i]);
      λ.push(result_d.eigenvalues[i]);
      U.push(result_d.eigenvectors[i]);
    }

  console.log("Eigenvalues:", λ);
  console.log("Eigenvectors:", U);
  
  // Calculate the embedding
  const X = numeric.rep([n, dimensions], 0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < dimensions; j++) {
        X[i][j] = U[j][i] * Math.sqrt(λ[j]);
      }
    }
  
  return X
  
}

function generatePlotData(mdsCoord, textNames) {
    return {
        x: mdsCoord.map(coord => coord[0]),
        y: mdsCoord.map(coord => coord[1]),
        text: textNames.map(replaceNames),
        mode: 'markers',
        marker: {
            color: textNames.map(t => color_dict[t] || '#000000'),
            symbol: textNames.map(t => symbol_dict[replaceNames(t)] || 'circle')
        },
        type: 'scatter'
    };
}

function generatePlotLayout(xTitle, yTitle) {
    return {
        xaxis: { title: xTitle, range: [-9, 9] },
        yaxis: { title: yTitle, scaleanchor: "x", scaleratio: 1, range: [-4, 4] }
    };
}



function restrictedDistanceMatrix(indices, db_multi, d_mat) {
    if (indices.length === 0) {
      indices = Array.from({length: db_multi.length}, (_, i) => i);
    }
    console.log("indices in:", indices);

    const keyWords = indices.map(i => db_multi[i]["Search word"]);
    
    
    console.log("keyWords:", keyWords);
    console.log("d_mat:", d_mat[0]);

    const idxKeepWithIndices = Object.keys(d_mat[0]).reduce((acc, col, index) => {
      if (keyWords.some(word => col.includes(word))) {
          acc.strings.push(col);
          acc.indices.push(index);
      }
      return acc;
    }, { strings: [], indices: [] });
    console.log("keyWords:", keyWords);

    const idxKeep = idxKeepWithIndices.strings;
    const idxKeepIndices = idxKeepWithIndices.indices;

    console.log("d_mat e.g.:", d_mat[0]);
    console.log("idxKeepIndices", idxKeepIndices);
    console.log("idxKeep:", idxKeep);
    const distanceMatrix = idxKeepIndices.map(row => idxKeep.map(col => parseFloat(d_mat[row][col])));
    return { distanceMatrix, textNames: idxKeep };
}

function replaceNames(textName) {
    const idx = globalDbMulti.findIndex(row => textName.includes(row["Search word"]));
    return idx !== -1 ? globalDbMulti[idx]["System name"] : textName;
}

async function initData() {
    try {
        console.log("Initializing data...");
        globalDbMulti = await fetchCSV('/data/db_multi.csv');
        console.log("db_multi loaded_:", globalDbMulti);
        console.log("Last 3 items of db_multi:", globalDbMulti.slice(-3));
        const d_mat = await fetchCSV('/data/total_distance_compute.csv');
        
        populateTable(globalDbMulti, d_mat);
        initializePlots(globalDbMulti, d_mat);

        document.getElementById('clearSelection').addEventListener('click', () => {
          selectedSystems = [];
          document.querySelectorAll('#systemTable tbody tr').forEach(row => {
            row.classList.remove('selected');
          });
        
          updatePlots(selectedSystems, globalDbMulti, d_mat);
        });
    } catch (error) {
        console.error("Error initializing data:", error);
    }
}

function initializePlots(db_multi, d_mat) {
    console.log("Initializing plots...");
    const allIndices = Array.from({length: db_multi.length}, (_, i) => i);
    updatePlots(allIndices, db_multi, d_mat);
}

function updatePlots(selectedIndices, db_multi, d_mat) {
    console.log("Updating plots with indices:", selectedIndices);
    if (selectedIndices.length === 0) {
      selectedIndices = Array.from({length: db_multi.length}, (_, i) => i);
    }
    
    const { distanceMatrix, textNames } = restrictedDistanceMatrix(selectedIndices, db_multi, d_mat);
    console.log("Distance Matrix:", distanceMatrix);
    console.log("Text Names:", textNames);


    const mdsCoords = classicalMDS(distanceMatrix);
    //const mdsCoords = iterativeMDS(distanceMatrix);
    console.log("MDS Coordinates:", mdsCoords)
    

    const plotData12 = generatePlotData(mdsCoords.map(coord => [coord[0], coord[1]]), textNames);
    const plotData23 = generatePlotData(mdsCoords.map(coord => [coord[2], coord[1]]), textNames);

    console.log("Plot Data 12:", plotData12);
    console.log("Plot Data 23:", plotData23);

    try {
        Plotly.newPlot('MDS12Plot', [plotData12], generatePlotLayout("MDS PC1", "MDS PC2"));
        console.log("MDS12Plot generated");
    } catch (error) {
        console.error("Error generating MDS12Plot:", error);
    }

    try {
        Plotly.newPlot('MDS23Plot', [plotData23], generatePlotLayout("MDS PC3", "MDS PC2"));
        console.log("MDS23Plot generated");
    } catch (error) {
        console.error("Error generating MDS23Plot:", error);
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', initData);



// You also need to define color_dict and symbol_dict here
const color_dict = {
      "cheng_zebrafish_region_2": "A6CEE2", 
      "cheng_zebrafish_region_3": "#2179B4",
      "cheng_zebrafish_region_4": "#B4D88B",
      "cheng_zebrafish_region_5": "#36A047",
      "cheng_zebrafish_region_6": "#F6999A",
      "cheng_zebrafish_region_7": "#E21F26",
      "cheng_zebrafish_region_8": "#FDBF6F",
      "cheng_zebrafish_region_9": "#F57F20",
      "cheng_zebrafish_region_10": "#CAB3D6",
      "data/motif/Biofilm/ecoli_Pos11-kde2011.h5": "#EC523F", 
      "data/motif/Biofilm/ecoli_Pos14_3-kde2011.h5": "#EC523F", 
      "data/motif/Biofilm/ecoli_Pos19-kde2011.h5": "#EC523F", 
      "data/motif/Biofilm/ecoli_Pos32-kde2011.h5": "#EC523F", 
      "data/motif/Biofilm/ecoli_Pos6_3-kde2011.h5": "#EC523F", 
      "data/motif/Biofilm/pseudomonas_Pos11.h5": "#40A44A", 
      "data/motif/Biofilm/pseudomonas_Pos28.h5": "#40A44A", 
      "data/motif/Biofilm/pseudomonas_Pos41.h5": "#40A44A", 
      "data/motif/Biofilm/pseudomonas_Pos47.h5": "#40A44A", 
      "data/motif/Biofilm/pseudomonas_Pos5.h5": "#40A44A", 
      "data/motif/Biofilm/salmonella_Pos10.h5": "#B276B2", 
      "data/motif/Biofilm/salmonella_Pos13.h5": "#B276B2", 
      "data/motif/Biofilm/salmonella_Pos16.h5": "#B276B2", 
      "data/motif/Biofilm/salmonella_Pos19.h5": "#B276B2", 
      "data/motif/Biofilm/salmonella_Pos21.h5": "#B276B2", 
      "data/motif/Biofilm/vibrio_Pos11-kdv615.h5": "#AB8E30", 
      "data/motif/Biofilm/vibrio_Pos16-kdv615.h5": "#AB8E30", 
      "data/motif/Biofilm/vibrio_Pos23-kdv615.h5": "#AB8E30", 
      "data/motif/Biofilm/vibrio_Pos27-kdv615.h5": "#AB8E30", 
      "data/motif/Biofilm/vibrio_Pos5-kdv615.h5": "#AB8E30", 
      "data/motif/Keller2008/zebrafish_embryo_150.h5": "#9BD2D9",
      "data/motif/Keller2008/zebrafish_embryo_230.h5": "#7ABDD0", 
      "data/motif/Keller2008/zebrafish_embryo_310.h5": "#60A5C6", 
      "data/motif/Keller2008/zebrafish_embryo_390.h5": "#4D8EBF", 
      "data/motif/Keller2008/zebrafish_embryo_470.h5": "#4375B5", 
      "data/motif/Keller2008/zebrafish_embryo_550.h5": "#405CA7", 
      "data/motif/Keller2008/zebrafish_embryo_630.h5": "#3D448A", 
      "data/motif/Keller2008/zebrafish_embryo_710.h5": "#333265", 
      "data/motif/Keller2008/zebrafish_embryo_790.h5": "#21203F", 
      "data/motif/Keller2008/zebrafish_embryo_870.h5": "#111321", 
      "data/motif/Keller2010/fly_embryo_51.h5": "#FCDEB3", 
      "data/motif/Keller2010/fly_embryo_61.h5": "#FDD49E", 
      "data/motif/Keller2010/fly_embryo_71.h5": "#FDC892", 
      "data/motif/Keller2010/fly_embryo_81.h5": "#FBBA84", 
      "data/motif/Keller2010/fly_embryo_91.h5": "#F9A470", 
      "data/motif/Keller2010/fly_embryo_101.h5": "#F68D5C", 
      "data/motif/Keller2010/fly_embryo_111.h5": "#F47A51", 
      "data/motif/Keller2010/fly_embryo_121.h5": "#ED6648", 
      "data/motif/Keller2010/fly_embryo_131.h5": "#E34C34",
      "data/motif/Keller2010/fly_embryo_141.h5": "#D83327", 
      "data/motif/Keller2010/fly_embryo_151.h5": "#C42126", 
      "data/motif/Keller2010/fly_embryo_161.h5": "#B21F24", 
      "data/motif/Keller2010/fly_embryo_171.h5": "#991D20", 
      "data/motif/Keller2010/fly_embryo_181.h5": "#7E1416", 
      "worm": "#FFDE17", 
      "ascidian": "#FDBF6D", 
      "Guo_organoid": "#2279B5", 
      "data/motif/Packing/PackedEllipses1.h5": "#E21F26", 
      "data/motif/Packing/PackedMandM1.h5": "#36A047", 
      "data/motif/Packing/PackedIreg1.h5": "#F57F20", 
      "data/motif/Packing/PackedSpheres1.h5": "#2179B4", 
      "data/motif/Packing/PolySpheres1.h5": "#942768", 
      "data/motif/Packing/PackedEllipses2.h5": "#E21F26", 
      "data/motif/Packing/PackedMandM2.h5": "#36A047", 
      "data/motif/Packing/PackedIreg2.h5": "#F57F20", 
      "data/motif/Packing/PackedSpheres2.h5": "#2179B4", 
      "data/motif/Packing/PolySpheres2.h5": "#942768", 
      "data/motif/Packing/PackedEllipses3.h5": "#E21F26", 
      "data/motif/Packing/PackedMandM3.h5": "#36A047", 
      "data/motif/Packing/PackedIreg3.h5": "#F57F20", 
      "data/motif/Packing/PackedSpheres3.h5": "#2179B4", 
      "data/motif/Packing/PolySpheres3.h5": "#942768", 
      "data/motif/Packing/PackedEllipses4.h5": "#E21F26", 
      "data/motif/Packing/PackedMandM4.h5": "#36A047",
      "data/motif/Packing/PackedIreg4.h5": "#F57F20", 
      "data/motif/Packing/PackedSpheres4.h5": "#2179B4", 
      "data/motif/Packing/PolySpheres4.h5": "#942768", 
      "data/motif/Packing/PackedEllipses5.h5": "#E21F26", 
      "data/motif/Packing/PackedMandM5.h5": "#36A047", 
      "data/motif/Packing/PackedIreg5.h5": "#F57F20", 
      "data/motif/Packing/PackedSpheres5.h5": "#2179B4", 
      "data/motif/Packing/PolySpheres5.h5": "#942768", 
      "data/motif/PV/PV_1.h5": "#942768", 
      "data/motif/PV/PV_2.h5": "#942768", 
      "data/motif/PV/PV_3.h5": "#942768", 
      "data/motif/PV/PV_4.h5": "#942768", 
      "data/motif/PV/PV_5.h5": "#942768", 
      "data/motif/Glassy/glass_T_044_1.h5": "#E12028", 
      "data/motif/Glassy/glass_T_044_2.h5": "#E12028", 
      "data/motif/Glassy/glass_T_044_3.h5": "#E12028", 
      "data/motif/HYGStarDatabase/star_positions.h5": "#8E9738", 
      "data/motif/DLA/DLA_1.h5": "#8E9838", 
      "data/motif/DLA/DLA_2.h5": "#8E9838", 
      "data/motif/DLA/DLA_3.h5": "#8E9838", 
      "data/motif/DLA/DLA_4.h5": "#8E9838", 
      "data/motif/DLA/DLA_5.h5": "#8E9838",
      "Plant_1": "#ED513F",
      "Plant_2": "#ED513F",
      "Plant_4": "#ED513F",
      "Plant_13": "#ED513F",
      "Plant_15": "#ED513F",
      "Plant_18": "#ED513F",
      "foam": "#e21f26",
      "bubbles": "#2179B4",
      "yeast": "#a6cee2"
};

const symbol_dict = {
                  "White Matter": "diamond",
                  "Telencephalon": "diamond",
                  "Diencephalon": "diamond",
                  "Mesencephalon": "diamond",
                  "Metencephalon": "diamond",
                  "Mylencephalon": "diamond",
                  "Spinal Cord": "diamond",
                  "Olfactory Epithelium": "diamond",
                  "Hypothalamus": "diamond",
                  "E. coli": "square", 
                  "P. aeruginosa": "square", 
                  "S. enterica": "square", 
                  "V. cholerae": "square", 
                  "Zebrafish Embryo": "circle",
                  "D. melongaster": "hexagon", 
                  "C. elegans": "triangle-down",  
                  "P. mammillata": "triangle-down", 
                  "Cancer organoid": "triangle-down", 
                  "Sphere packing": "triangle-up-open",
                  "1:1:4 ellipsoids": "triangle-up-open",
                  "1:4:4: ellipsoids": "triangle-up-open",
                  "1:2:3: ellipsoids": "triangle-up-open",
                  "Polydisperse packing": "triangle-up-open", 
                  "Glassy material": "square-open",  
                  "Diffusion limited aggregation": "circle-open",
                  "Star positions": "star-open", 
                  "Poisson-Voronoi": "square-open",
                  "A. thaliana": "triangle-down",
                  "Polyurethane foam": "diamond-open", 
                  "Fluid foam": "diamond-open", 
                  "Snowflake yeast": "star"
};
