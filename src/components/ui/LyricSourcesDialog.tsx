import DeleteIcon from "@mui/icons-material/Delete";
import DragHandleIcon from "@mui/icons-material/DragHandle";
import {
	Alert,
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	IconButton,
	List,
	ListItem,
	ListItemText,
	Switch,
	TextField,
	Tooltip,
	Typography,
} from "@mui/material";
import { useAtom } from "jotai";
import { useState } from "react";
import { lyricSourcesConfigAtom } from "@/store";
import { parseSourceString } from "@/utils/source";

export interface LyricSourcesDialogProps {
	open: boolean;
	onClose: () => void;
}

export function LyricSourcesDialog({ open, onClose }: LyricSourcesDialogProps) {
	const [sources, setSources] = useAtom(lyricSourcesConfigAtom);
	const [newSourceStr, setNewSourceStr] = useState("");
	const [errorMsg, setErrorMsg] = useState("");

	const [dragIndex, setDragIndex] = useState<number | null>(null);
	const [dropLineIndex, setDropLineIndex] = useState<number | null>(null);

	const handleToggle = (index: number) => {
		const newSources = [...sources];
		newSources[index].enabled = !newSources[index].enabled;
		setSources(newSources);
	};

	const handleDelete = (index: number) => {
		const newSources = [...sources];
		newSources.splice(index, 1);
		setSources(newSources);
	};

	const handleAddSource = () => {
		if (!newSourceStr.trim()) return;
		try {
			const parsedSource = parseSourceString(newSourceStr);

			if (sources.some((s) => s.source.id === parsedSource.id)) {
				setErrorMsg("该歌词源已存在，请勿重复添加！");
				return;
			}

			setSources([...sources, { enabled: true, source: parsedSource }]);
			setNewSourceStr("");
			setErrorMsg("");
		} catch (e) {
			console.error("解析歌词源失败", e);
			setErrorMsg("解析失败，请检查歌词源字符串格式是否正确");
		}
	};

	const handleDragStart = (
		e: React.DragEvent<HTMLLIElement>,
		index: number,
	) => {
		setDragIndex(index);
		e.dataTransfer.effectAllowed = "move";
		e.dataTransfer.setData("text/plain", index.toString());
	};

	const handleDragOver = (e: React.DragEvent<HTMLLIElement>, index: number) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";

		const rect = e.currentTarget.getBoundingClientRect();
		const middleY = rect.top + rect.height / 2;

		const targetGap = e.clientY < middleY ? index : index + 1;

		if (targetGap !== dropLineIndex) {
			setDropLineIndex(targetGap);
		}
	};

	const handleDrop = (e: React.DragEvent<HTMLLIElement>) => {
		e.preventDefault();
		if (dragIndex === null || dropLineIndex === null) {
			handleDragEnd();
			return;
		}

		if (dropLineIndex === dragIndex || dropLineIndex === dragIndex + 1) {
			handleDragEnd();
			return;
		}

		const newSources = [...sources];
		const draggedItem = newSources[dragIndex];

		newSources.splice(dragIndex, 1);

		const insertIndex =
			dropLineIndex > dragIndex ? dropLineIndex - 1 : dropLineIndex;

		newSources.splice(insertIndex, 0, draggedItem);

		setSources(newSources);
		handleDragEnd();
	};

	const handleDragEnd = () => {
		setDragIndex(null);
		setDropLineIndex(null);
	};

	return (
		<Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
			<DialogTitle sx={{ fontWeight: "bold" }}>歌词源设置</DialogTitle>
			<DialogContent dividers>
				<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
					越靠前的歌词源优先级越高，命中高优先级的歌词源后则不再寻找低优先级的歌词源
				</Typography>

				<List
					sx={{
						bgcolor: "background.paper",
						borderRadius: 1,
						border: "1px solid",
						borderColor: "divider",
						overflow: "hidden",
					}}
				>
					{sources.map((item, index) => {
						const isBuiltin = item.source.type.startsWith("builtin");

						const showTopLine = dropLineIndex === index;
						const showBottomLine =
							index === sources.length - 1 && dropLineIndex === sources.length;
						const showLine = showTopLine || showBottomLine;

						return (
							<ListItem
								key={item.source.id}
								divider={index !== sources.length - 1}
								draggable
								onDragStart={(e) => handleDragStart(e, index)}
								onDragEnter={(e) => e.preventDefault()}
								onDragOver={(e) => handleDragOver(e, index)}
								onDrop={handleDrop}
								onDragEnd={handleDragEnd}
								sx={{
									pr: 14,
									pl: 1,
									py: 1.5,
									cursor: "grab",
									position: "relative",

									"& > *": {
										opacity: dragIndex === index ? 0.4 : 1,
										transition: "opacity 0.2s ease",
									},

									"&::before": showLine
										? {
												content: '""',
												position: "absolute",
												left: 0,
												right: 0,
												height: "2px",
												bgcolor: "primary.main",
												zIndex: 1,
												[showBottomLine ? "bottom" : "top"]: 0,
											}
										: {},
								}}
							>
								<Box
									sx={{
										display: "flex",
										alignItems: "center",
										color: "text.disabled",
										mr: 2,
									}}
								>
									<DragHandleIcon />
								</Box>

								<ListItemText
									primary={
										<Typography
											variant="subtitle2"
											sx={{
												fontWeight: item.enabled ? "bold" : "normal",
												color: item.enabled ? "text.primary" : "text.disabled",
											}}
										>
											{item.source.name || "未命名歌词源"}
										</Typography>
									}
									secondary={
										<Typography
											variant="caption"
											color={item.enabled ? "text.secondary" : "text.disabled"}
											noWrap
										>
											格式: {item.source.format.toUpperCase()}
											{item.source.desc}
										</Typography>
									}
								/>

								<Box
									sx={{
										display: "flex",
										alignItems: "center",
										position: "absolute",
										right: 8,
									}}
								>
									<Switch
										size="small"
										checked={item.enabled}
										onChange={() => handleToggle(index)}
										color="primary"
									/>
									{!isBuiltin && (
										<Tooltip title="删除">
											<IconButton
												size="small"
												color="error"
												onClick={() => handleDelete(index)}
											>
												<DeleteIcon fontSize="small" />
											</IconButton>
										</Tooltip>
									)}
								</Box>
							</ListItem>
						);
					})}
				</List>

				<Box sx={{ mt: 4 }}>
					<Typography variant="subtitle2" sx={{ mb: 1 }}>
						添加外部歌词源
					</Typography>
					<Box sx={{ display: "flex", gap: 1 }}>
						<TextField
							size="small"
							fullWidth
							placeholder="id|name|desc|type|url"
							value={newSourceStr}
							onChange={(e) => setNewSourceStr(e.target.value)}
							error={!!errorMsg}
						/>
						<Button
							variant="contained"
							disableElevation
							onClick={handleAddSource}
						>
							添加
						</Button>
					</Box>
					{errorMsg && (
						<Alert severity="warning" sx={{ mt: 1, py: 0 }}>
							{errorMsg}
						</Alert>
					)}
				</Box>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose} color="inherit">
					完成
				</Button>
			</DialogActions>
		</Dialog>
	);
}
